'use strict'

const path = require('path')
const Etcd = require('node-etcd')

const utils = require('microscopic-utils')
const Random = utils.random
const Retry = utils.retry
const JsonUtils = utils.json

const SERVICES_KEY = 'services'
const SERVICES_OPTIONS_KEY = 'services-options'
const TTL_SECONDS = 120

const _etcd = Symbol('etcd')
const _options = Symbol('options')
const _services = Symbol('services')

class ETCDServiceRegistry {
  /**
   * @param {Microscopic} microscopic
   */
  constructor (hosts, options = {}) {
    /**
     * @type {Map}
     * @private
     */
    this[ _services ] = new Map()

    /**
     * @type {Etcd}
     * @private
     */
    this[ _etcd ] = new Etcd(hosts)

    /**
     * @type {object}
     * @private
     */
    this[ _options ] = options
    this[ _options ].tll = this[ _options ].ttl || TTL_SECONDS

    this._initWatcher()
  }

  /**
   * Registers service.
   *
   * @param {string} name
   * @param {string} address
   * @param {number} port
   * @param {string} transportType
   * @returns {string} Returns ID of service.
   */
  register (name, connectionConfig, options = {}) {
    const service = {
      id: Random.uuid(),
      name: name,
      connection: connectionConfig
    }

    this._saveService(service)
    this._saveServiceOptions(service.name, options)

    return service.id
  }

  /**
   * Refresh service / node TTl.
   *
   * @param {string} name
   * @param {string} id
   */
  renew (name, id) {
    return this.getService(name)
      .then((nodes) => {
        const node = nodes.find((node) => node.id === id)

        if (!node) {
          return
        }

        this._saveService(node)
      })
  }

  /**
   * Returns list of service nodes.
   *
   * @param {string} name
   * @returns {Promise.<array.<ServiceDefinition>>}
   */
  getService (name) {
    return Retry.retry({ retries: 15, timeout: 25 }, (callback) => {
      let nodes = this[ _services ].get(name)

      if (nodes && nodes.length) {
        return callback(null, nodes)
      }

      const key = path.join(SERVICES_KEY, name)

      this[ _etcd ].get(key, (error, body) => {
        if (error || !body || !body.node || !body.node.nodes || !body.node.nodes.length) {
          return callback(new Error('Not found service!'))
        }

        return callback(null, body.node.nodes.map((node) => JsonUtils.parse(node.value)))
      })
    })
  }

  /**
   * Returns options of service.
   *
   * @param {string} serviceName
   * @returns {Promise.<object|undefined>}
   */
  getServiceOptions (serviceName) {
    return Retry.retry({ retries: 10, timeout: (attempt) => attempt * 250 }, (callback) => {
      const key = path.join(SERVICES_OPTIONS_KEY, serviceName)

      this[ _etcd ].get(key, (error, body) => {
        if (error || !body || !body.node) {
          return callback(new Error('Not found service options!'))
        }

        callback(null, JsonUtils.parse(body.node.value))
      })
    })
  }

  /**
   * Saves service into ETCD.
   *
   * @param {ServiceDefinition} service
   * @private
   */
  _saveService (service) {
    const key = path.join(SERVICES_KEY, service.name, service.id)

    this[ _etcd ].set(key, JsonUtils.stringify(service), { maxRetries: 3, ttl: this[ _options ].ttl })
  }

  /**
   * Save service options into ETCD.
   *
   * @param {string} serviceName
   * @param {object} options
   * @private
   */
  _saveServiceOptions (serviceName, options) {
    const key = path.join(SERVICES_OPTIONS_KEY, serviceName)

    this[ _etcd ].set(key, JsonUtils.stringify(options), { maxRetries: 3 })
  }

  /**
   * Starts services key watcher. Updates list of services.
   *
   * @private
   */
  _initWatcher () {
    this._loadServices()

    const watcher = this[ _etcd ].watcher(SERVICES_KEY, 1, { recursive: true })
    watcher.on('change', () => this._loadServices())
    watcher.on('error', console.log)
  }

  /**
   * Load services into memory.
   *
   * @protected
   */
  _loadServices () {
    this[ _services ].clear()

    this[ _etcd ].get(SERVICES_KEY, { recursive: true }, (err, services) => {
      if (err) {
        return
      }

      /* istanbul ignore next */
      if (!services.node || !services.node.nodes) {
        return
      }

      for (const service of services.node.nodes) {
        const name = path.basename(service.key)

        /* istanbul ignore else */
        if (service.nodes) {
          const nodes = service.nodes.map((node) => JsonUtils.parse(node.value))

          this[ _services ].set(name, nodes)
        }
      }
    })
  }
}

module.exports = ETCDServiceRegistry

/**
 * @typedef {object} ServiceDefinition
 * @property {string} id
 * @property {string} name
 * @property {object} connection
 * @property {string} type
 */

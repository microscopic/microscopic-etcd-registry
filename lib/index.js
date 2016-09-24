'use strict'

const path = require('path')
const Etcd = require('node-etcd')

const utils = require('microscopic-utils')
const Random = utils.random
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
    const nodes = this.getService(name)

    if (!nodes || !Array.isArray(nodes)) {
      return
    }

    const node = nodes.find((node) => node.id === id)

    if (!node) {
      return
    }

    this._saveService(node)
  }

  /**
   * Returns list of service nodes.
   *
   * @param {string} name
   * @returns {array.<ServiceDefinition>}
   */
  getService (name) {
    return this._getService(5, name)
  }

  /**
   * Returns options of service.
   *
   * @param {string} serviceName
   * @returns {Promise.<object|undefined>}
   */
  getServiceOptions (serviceName) {
    return this._getServiceOptions(serviceName)
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

        if (service.nodes) {
          const nodes = service.nodes.map((node) => JsonUtils.parse(node.value))

          this[ _services ].set(name, nodes)
        }
      }
    })
  }

  /**
   * Gets service from memory or try gets service from server.
   *
   * @param {number} maxRetries - Number of retries.
   * @param {string} name - Name of service.
   * @returns {array.<ServiceDefinition>}
   * @protected
   */
  _getService (maxRetries, name) {
    try {
      let nodes = this[ _services ].get(name)

      if (nodes && nodes.length) {
        return nodes
      }

      const key = path.join(SERVICES_KEY, name)

      const result = this[ _etcd ].getSync(key, { recursive: true })

      if (result.err) {
        throw new Error(result.err)
      }

      const services = result.body

      if (!services || !services.node || !services.node.nodes || !services.node.nodes.length) {
        throw new Error('Not found any node of service')
      }

      nodes = services.node.nodes.map((node) => JsonUtils.parse(node.value))

      return nodes
    } catch (error) {
      if (maxRetries <= 0) {
        return undefined
      }

      return this._getService(maxRetries - 1, name)
    }
  }

  /**
   * Try gets service from server.
   *
   * @param {string} name - Name of service.
   * @returns {Promise.<object>}
   * @protected
   */
  _getServiceOptions (name) {
    const MAX_RETRIES = 10

    const that = this

    return new Promise((resolve) => {
      _getServiceOptions(MAX_RETRIES, resolve)
    })

    function _getServiceOptions (maxRetries, resolve) {
      const key = path.join(SERVICES_OPTIONS_KEY, name)

      that[ _etcd ].get(key, (error, body) => {
        if (error || !body || !body.node) {
          if (maxRetries <= 0) {
            resolve(undefined)
          }

          setTimeout(() => {
            _getServiceOptions(maxRetries - 1, resolve)
          }, (MAX_RETRIES - maxRetries) * 500)

          return
        }

        resolve(JsonUtils.parse(body.node.value))
      })
    }
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

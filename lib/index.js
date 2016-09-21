'use strict'

const path = require('path')
const Etcd = require('node-etcd')

const utils = require('microscopic-utils')
const Random = utils.random
const JsonUtils = utils.json

const SERVICES_KEY = 'services'
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
      connection: connectionConfig,
      options: options
    }

    this._saveService(service)

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
   * Returns node of service.
   *
   * @param {string} name
   * @returns {string|undefined}
   */
  getServiceNode (name) {
    const nodes = this.getService(name)

    /* istanbul ignore next */
    return nodes && nodes.length ? nodes[ 0 ] : undefined
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
}

module.exports = ETCDServiceRegistry

/**
 * @typedef {object} ServiceDefinition
 * @property {string} id
 * @property {string} name
 * @property {object} connection
 * @property {string} type
 */
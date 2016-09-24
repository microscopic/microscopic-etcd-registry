'use strict'

const chai = require('chai')
const Etcd = require('node-etcd')

const expect = chai.expect

const ETCDRegistry = require('../lib/index')

const ETCD_SERVER = 'http://etcd:2379'

describe('ETCD Registry', () => {
  afterEach((done) => {
    const etcd = new Etcd(ETCD_SERVER)

    etcd.get('services', (error, services) => {
      if (services) {
        etcd.del('services', { recursive: true }, () => {
          etcd.del('services-options', { recursive: true }, done)
        })
      } else {
        done()
      }
    })
  })

  describe('constructor()', () => {
    it('should synchronize local list of services after init', () => {
      const etcd = new ETCDRegistry(ETCD_SERVER)

      etcd.register('test', { address: 'test' }, { a: 1, b: 2 })
      etcd.register('test1', { address: 'test' }, { a: 1, b: 2 })
      etcd.register('test2', { address: 'test' }, { a: 1, b: 2 })

      const etcd2 = new ETCDRegistry(ETCD_SERVER)

      expect(etcd2.getService('test').length).to.be.equal(1)
      expect(etcd2.getService('test1').length).to.be.equal(1)
      expect(etcd2.getService('test2').length).to.be.equal(1)
    })
  })

  describe('register()', () => {
    it('should register service', () => {
      const etcd = new ETCDRegistry(ETCD_SERVER)

      etcd.register('test', { address: 'test' }, { a: 1, b: 2 })

      const nodes = etcd.getService('test')

      expect(nodes.length).to.be.equal(1)

      const node = nodes[ 0 ]

      expect(node.name).to.be.equal('test')
      expect(node.connection.address).to.be.equal('test')
    })

    it('should register service and synchronize between all clients', () => {
      const etcd = new ETCDRegistry(ETCD_SERVER)
      const etcd2 = new ETCDRegistry(ETCD_SERVER)

      etcd.register('test', { address: 'test' }, { a: 1, b: 2 })

      const nodes = etcd2.getService('test')

      expect(nodes.length).to.be.equal(1)

      const node = nodes[ 0 ]

      expect(node.name).to.be.equal('test')
      expect(node.connection.address).to.be.equal('test')
    })

    it('should register service with TTL', (done) => {
      const etcd = new ETCDRegistry(ETCD_SERVER, { ttl: 5 })

      etcd.register('test', { address: 'test' }, { a: 1, b: 2 })

      expect(etcd.getService('test').length).to.be.equal(1)

      setTimeout(() => {
        expect(etcd.getService('test')).to.be.undefined
        done()
      }, 6 * 1000)
    }).timeout(30 * 1000)
  })

  describe('getServiceOptions()', () => {
    it('should return options of service', (done) => {
      const etcd = new ETCDRegistry(ETCD_SERVER)

      etcd.register('test', { address: 'test' }, { a: 1, b: 2 })

      etcd.getServiceOptions('test')
        .then((options) => {
          expect(options.a).to.be.equal(1)
          expect(options.b).to.be.equal(2)

          done()
        })
    }).timeout(30 * 1000)

    it('should return undefined if servicem does not exist', (done) => {
      const etcd = new ETCDRegistry(ETCD_SERVER)

      etcd.register('test123', { address: 'test' }, { a: 1, b: 2 })

      etcd.getServiceOptions('test')
        .then((options) => {
          expect(options).to.be.undefined

          done()
        })
    }).timeout(30 * 1000)
  })

  describe('renew()', () => {
    it('should renew TTL', (done) => {
      const etcd = new ETCDRegistry(ETCD_SERVER, { ttl: 5 })

      const id = etcd.register('test', { address: 'test' }, { a: 1, b: 2 })

      expect(etcd.getService('test').length).to.be.equal(1)

      setTimeout(() => {
        etcd.renew('test', id)
      }, 4 * 1000)

      setTimeout(() => {
        expect(etcd.getService('test').length).to.be.equal(1)
        done()
      }, 6 * 1000)
    }).timeout(30 * 1000)

    it('should do nothing if nodes do not exist', () => {
      const etcd = new ETCDRegistry(ETCD_SERVER, { ttl: 5 })

      etcd.renew('test', 9999999)
    })

    it('should do nothing if node does not exist', () => {
      const etcd = new ETCDRegistry(ETCD_SERVER, { ttl: 5 })
      etcd.register('test', { address: 'test' }, { a: 1, b: 2 })

      etcd.renew('test', 9999999)
    })
  })
})

'use strict'

const chai = require('chai')
const Etcd = require('node-etcd')

const expect = chai.expect

const ETCDRegistry = require('../lib/index')

describe('ETCD Registry', () => {
  afterEach((done) => {
    const etcd = new Etcd('http://etcd:2379')

    etcd.get('services', (error, services) => {
      if (error) {
        throw error
      }

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
      const etcd = new ETCDRegistry('http://etcd:2379')

      etcd.register('test', { address: 'test' }, { a: 1, b: 2 })
      etcd.register('test1', { address: 'test' }, { a: 1, b: 2 })
      etcd.register('test2', { address: 'test' }, { a: 1, b: 2 })

      const etcd2 = new ETCDRegistry('http://etcd:2379')

      expect(etcd2.getService('test').length).to.be.equal(1)
      expect(etcd2.getService('test1').length).to.be.equal(1)
      expect(etcd2.getService('test2').length).to.be.equal(1)
    })
  })

  describe('register()', () => {
    it('should register service', () => {
      const etcd = new ETCDRegistry('http://etcd:2379')

      etcd.register('test', { address: 'test' }, { a: 1, b: 2 })

      const nodes = etcd.getService('test')

      expect(nodes.length).to.be.equal(1)

      const node = nodes[ 0 ]

      expect(node.name).to.be.equal('test')
      expect(node.connection.address).to.be.equal('test')
    })

    it('should register service and synchronize between all clients', () => {
      const etcd = new ETCDRegistry('http://etcd:2379')
      const etcd2 = new ETCDRegistry('http://etcd:2379')

      etcd.register('test', { address: 'test' }, { a: 1, b: 2 })

      const nodes = etcd2.getService('test')

      expect(nodes.length).to.be.equal(1)

      const node = nodes[ 0 ]

      expect(node.name).to.be.equal('test')
      expect(node.connection.address).to.be.equal('test')
    })

    it('should register service with TTL', (done) => {
      const etcd = new ETCDRegistry('http://etcd:2379', { ttl: 5 })

      etcd.register('test', { address: 'test' }, { a: 1, b: 2 })

      expect(etcd.getService('test').length).to.be.equal(1)

      setTimeout(() => {
        expect(etcd.getService('test')).to.be.undefined
        done()
      }, 6 * 1000)
    }).timeout(30 * 1000)
  })

  describe('getServiceOptions()', () => {
    it('should return options of service', () => {
      const etcd = new ETCDRegistry('http://etcd:2379')

      etcd.register('test', { address: 'test' }, { a: 1, b: 2 })

      const options = etcd.getServiceOptions('test')

      expect(options.a).to.be.equal(1)
      expect(options.b).to.be.equal(2)
    })

    it('should return undefined if servicem does not exist', () => {
      const etcd = new ETCDRegistry('http://etcd:2379')

      const options = etcd.getServiceOptions('test')

      expect(options).to.be.undefined
    })
  })

  describe('renew()', () => {
    it('should renew TTL', (done) => {
      const etcd = new ETCDRegistry('http://etcd:2379', { ttl: 5 })

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
      const etcd = new ETCDRegistry('http://etcd:2379', { ttl: 5 })

      etcd.renew('test', 9999999)
    })

    it('should do nothing if node does not exist', () => {
      const etcd = new ETCDRegistry('http://etcd:2379', { ttl: 5 })
      etcd.register('test', { address: 'test' }, { a: 1, b: 2 })

      etcd.renew('test', 9999999)
    })
  })
})

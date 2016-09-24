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
      if (!error && services) {
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

      return Promise.all([
        etcd2.getService('test'),
        etcd2.getService('test1'),
        etcd2.getService('test2')
      ]).then((results) => {
        expect(results[ 0 ].length).to.be.equal(1)
        expect(results[ 1 ].length).to.be.equal(1)
        expect(results[ 2 ].length).to.be.equal(1)
      })
    })
  })

  describe('register()', () => {
    it('should register service', () => {
      const etcd = new ETCDRegistry(ETCD_SERVER)

      etcd.register('test', { address: 'test' }, { a: 1, b: 2 })

      return etcd.getService('test')
        .then((nodes) => {
          expect(nodes.length).to.be.equal(1)

          const node = nodes[ 0 ]

          expect(node.name).to.be.equal('test')
          expect(node.connection.address).to.be.equal('test')
        })
    })

    it('should register service and synchronize between all clients', (done) => {
      const etcd = new ETCDRegistry(ETCD_SERVER)
      const etcd2 = new ETCDRegistry(ETCD_SERVER)

      etcd.register('test', { address: 'test' }, { a: 1, b: 2 })

      setTimeout(() => {
        etcd2.getService('test')
          .then((nodes) => {
            expect(nodes.length).to.be.equal(1)

            const node = nodes[ 0 ]

            expect(node.name).to.be.equal('test')
            expect(node.connection.address).to.be.equal('test')

            done()
          })
      }, 50)
    })

    it('should register service with TTL', (done) => {
      const etcd = new ETCDRegistry(ETCD_SERVER, { ttl: 1 })

      etcd.register('test', { address: 'test' }, { a: 1, b: 2 })

      etcd.getService('test')
        .then((nodes) => {
          expect(nodes.length).to.be.equal(1)

          setTimeout(() => {
            etcd.getService('test')
              .catch((error) => {
                expect(error.message).to.be.equal('Not found service!')
                done()
              })
          }, 2 * 1000)
        })
    }).timeout(3 * 1000)
  })

  describe('getServiceOptions()', () => {
    it('should return options of service', () => {
      const etcd = new ETCDRegistry(ETCD_SERVER)

      etcd.register('test', { address: 'test' }, { a: 1, b: 2 })

      return etcd.getServiceOptions('test')
        .then((options) => {
          expect(options.a).to.be.equal(1)
          expect(options.b).to.be.equal(2)
        })
    })

    it('should return error if service does not exist', () => {
      const etcd = new ETCDRegistry(ETCD_SERVER)

      etcd.register('test123', { address: 'test' }, { a: 1, b: 2 })

      return etcd.getServiceOptions('test')
        .catch((error) => {
          expect(error).to.be.instanceOf(Error)
        })
    }).timeout(30 * 1000)
  })

  describe('renew()', () => {
    it('should renew TTL', (done) => {
      const etcd = new ETCDRegistry(ETCD_SERVER, { ttl: 1 })

      const id = etcd.register('test', { address: 'test' }, { a: 1, b: 2 })

      etcd.getService('test')
        .then((nodes) => {
          expect(nodes.length).to.be.equal(1)

          setTimeout(() => {
            etcd.renew('test', id)
          }, 500)

          setTimeout(() => {
            etcd.getService('test')
              .then((nodes) => {
                expect(nodes.length).to.be.equal(1)
                done()
              })
          }, 1200)
        })
    }).timeout(3 * 1000)

    it('should do nothing if node does not exist', () => {
      const etcd = new ETCDRegistry(ETCD_SERVER, { ttl: 5 })
      etcd.register('test', { address: 'test' }, { a: 1, b: 2 })

      return etcd.renew('test', 9999999)
    })
  })
})

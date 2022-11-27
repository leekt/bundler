import { TracerTest, TracerTest__factory } from '../src/types'
import { ethers } from 'hardhat'
import { debug_traceCall } from '../src/GethTracer'
import { expect } from 'chai'
import { BundlerCollectorReturn, bundlerCollectorTracer } from '../src/BundlerCollectorTracer'
import { BytesLike } from 'ethers'

const provider = ethers.provider
const signer = provider.getSigner()

describe('#bundlerCollectorTracer', () => {
  let tester: TracerTest
  before(async () => {
    const ver = await (provider as any).send('web3_clientVersion')
    expect(ver).to.contain('Geth', 'test requires debug_traceCall which is not supported on hardhat')
    tester = await new TracerTest__factory(signer).deploy()
    await tester.deployTransaction.wait()
  })

  it('should count opcodes on depth>1', async () => {
    const ret = await traceExecSelf(tester.interface.encodeFunctionData('callTimeStamp'), false)
    const execEvent = tester.interface.decodeEventLog('ExecSelfResult', ret.logs[0].data, ret.logs[0].topics)
    expect(execEvent.success).to.equal(true)
    expect(ret.numberLevels[0].opcodes.TIMESTAMP).to.equal(1)
  })

  it('should not count opcodes on depth==1', async () => {
    const ret = await traceCall(tester.interface.encodeFunctionData('callTimeStamp'))
    expect(ret.numberLevels[0].opcodes.TIMESTAMP).to.be.undefined
    // verify no error..
    expect(ret.debug.toString()).to.not.match(/REVERT/)
  })

  async function traceCall (functionData: BytesLike): Promise<BundlerCollectorReturn> {
    const ret: BundlerCollectorReturn = await debug_traceCall(provider, {
      to: tester.address,
      data: functionData
    }, {
      tracer: bundlerCollectorTracer
    })
    return ret
  }

  // wrap call in a call to self (depth+1)
  async function traceExecSelf (functionData: BytesLike, useNumber = true): Promise<BundlerCollectorReturn> {
    const execTestCallGas = tester.interface.encodeFunctionData('execSelf', [functionData, useNumber])
    const ret = await traceCall(execTestCallGas)
    return ret
  }

  describe('#traceExecSelf', () => {
    it('should revert', async () => {
      const ret = await traceExecSelf('0xdead')
      expect(ret.debug.toString()).to.match(/execution reverted/)
      expect(ret.logs.length).to.equal(1)
      const log = tester.interface.decodeEventLog('ExecSelfResult', ret.logs[0].data, ret.logs[0].topics)
      expect(log.success).to.equal(false)
    })
    it('should call itself', async () => {
      // sanity check: execSelf works and call itself (even recursively)
      const innerCall = tester.interface.encodeFunctionData('doNothing')
      const execInner = tester.interface.encodeFunctionData('execSelf', [innerCall, false])
      const ret = await traceExecSelf(execInner)
      expect(ret.logs.length).to.equal(2)
      console.log(ret.logs.forEach(log => {
        const logParams = tester.interface.decodeEventLog('ExecSelfResult', log.data, log.topics)
        expect(logParams.success).to.equal(true)
      }))
    })
  })
  4
  it('should report direct use of GAS opcode', async () => {
    const ret = await traceExecSelf(tester.interface.encodeFunctionData('testCallGas'), false)
    expect(ret.numberLevels['0'].opcodes.GAS).to.eq(1)
  })

  it('should ignore gas used as part of "call"', async () => {
    // call the "testKeccak" function as a sample inner function
    const doNothing = tester.interface.encodeFunctionData('doNothing')
    const callDoNothing = tester.interface.encodeFunctionData('execSelf', [doNothing, false])
    const ret = await traceExecSelf(callDoNothing, false)
    expect(ret.numberLevels['0'].opcodes.GAS).to.be.undefined
  })

  it.skip('should collect reverted call info', async () => {
    const revertingCallData = tester.interface.encodeFunctionData('callRevertingFunction', [true])

    const tracer = bundlerCollectorTracer
    const ret = await debug_traceCall(provider, {
      to: tester.address,
      data: revertingCallData
    }, {
      tracer
    }) as BundlerCollectorReturn

    expect(ret.debug[0]).to.include(['fault'])
    // todo: tests for failures. (e.g. detect oog)
  })
})
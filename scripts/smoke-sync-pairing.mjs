import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'

/** Approve Electron's native dialog in the isolated smoke process, never in app code. */
export async function mockPairingDialog(inspectorPort) {
  const [{ webSocketDebuggerUrl }] = await (
    await fetch(`http://127.0.0.1:${inspectorPort}/json/list`)
  ).json()
  const socket = new WebSocket(webSocketDebuggerUrl)
  try {
    await new Promise((resolve, reject) => {
      socket.onopen = resolve
      socket.onerror = reject
    })
    const result = await new Promise((resolve) => {
      socket.onmessage = (message) => {
        const response = JSON.parse(message.data)
        if (response.id === 1) resolve(response)
      }
      socket.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: {
            expression: `(() => {
            const { dialog } = process.mainModule.require('electron');
            const real = dialog.showMessageBox;
            dialog.showMessageBox = function (...args) {
              if (args.at(-1)?.title === '设备同步确认') return Promise.resolve({response: 1});
              return real.apply(this, args);
            };
            return dialog.showMessageBox !== real;
          })()`,
            returnByValue: true
          }
        })
      )
    })
    assert.equal(result.result?.result?.value, true, JSON.stringify(result))
  } finally {
    socket.close()
  }
}

export async function approveSmokePair(peer, post) {
  const nonce = randomBytes(32).toString('hex')
  const challenge = await post(undefined, {
    operation: 'pair-start',
    sessionId: peer.id,
    commitment: createHash('sha256').update(nonce).digest('hex')
  })
  assert.equal(challenge.code, 200)
  assert.match(challenge.body.nonce, /^[a-f0-9]{64}$/)
  const grant = await post(undefined, { operation: 'pair-confirm', sessionId: peer.id, nonce })
  assert.equal(grant.code, 200)
  assert.match(grant.body.token, /^[a-f0-9]{64}$/)
  return grant.body.token
}

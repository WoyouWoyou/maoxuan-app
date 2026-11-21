import { createSocket, type Socket } from 'node:dgram'
import { DISCOVERY_PORT, DISCOVERY_PROBE, type SyncPeer } from '@shared/sync/protocol'

export async function advertiseSyncDevice(peer: SyncPeer, onError: (message: string) => void) {
  const socket: Socket = createSocket('udp4')
  const reply = Buffer.from(JSON.stringify(peer))
  socket.on('message', (message, remote) => {
    if (message.toString() !== DISCOVERY_PROBE) return
    socket.send(reply, remote.port, remote.address, () => {})
  })
  socket.on('error', (error) => onError(error.message))
  try {
    await new Promise<void>((resolve, reject) => {
      const failed = (error: Error) => reject(error)
      socket.once('error', failed)
      socket.bind(DISCOVERY_PORT, () => {
        socket.removeListener('error', failed)
        resolve()
      })
    })
  } catch (error) {
    socket.close()
    throw error
  }
  return () => socket.close()
}

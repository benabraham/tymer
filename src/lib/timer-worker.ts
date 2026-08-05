// Ultra-simple timer worker that just sends timestamps every second
//
// This runs in a dedicated worker scope, but the project's tsconfig loads the
// "dom" lib (needed everywhere else) rather than "webworker" — the two can't
// be mixed in one tsconfig without clashing global declarations. `self` here
// is narrowed to just the two members this file actually uses instead of
// pulling in the full worker lib.
type WorkerScope = {
    addEventListener: (
        type: 'message',
        listener: (event: MessageEvent<'start' | 'stop'>) => void,
    ) => void
    postMessage: (message: number) => void
}

const workerSelf = self as unknown as WorkerScope

let interval: ReturnType<typeof setInterval> | null = null

workerSelf.addEventListener('message', event => {
    if (event.data === 'start') {
        // Start sending timestamps every second
        interval = setInterval(() => {
            workerSelf.postMessage(Date.now())
        }, 1000)
    } else if (event.data === 'stop') {
        // Stop the interval
        if (interval) {
            clearInterval(interval)
            interval = null
        }
    }
})

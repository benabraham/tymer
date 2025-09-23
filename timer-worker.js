// Ultra-simple timer worker that just sends timestamps every second
let interval = null

self.addEventListener('message', (event) => {
    if (event.data === 'start') {
        // Start sending timestamps every second
        interval = setInterval(() => {
            self.postMessage(Date.now())
        }, 1000)
    } else if (event.data === 'stop') {
        // Stop the interval
        if (interval) {
            clearInterval(interval)
            interval = null
        }
    }
})
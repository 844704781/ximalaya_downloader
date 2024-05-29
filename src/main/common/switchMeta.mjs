class SwitchMeta {
  constructor() {
    this.isStart = true
    this.callback = null
  }

  setCallback(callback) {
    this.callback = callback
  }

  setStart(isStart) {
    if (this.callback != null) {
      this.callback(isStart)
    }
    this.isStart = isStart
  }

  getStart() {
    return this.isStart
  }
}


const switchMeta = new SwitchMeta()


export {
  switchMeta
}

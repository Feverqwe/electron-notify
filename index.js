const fs = require('fs');
const path = require('path');
const electron = require('electron');
const BrowserWindow = electron.BrowserWindow;
const ipc = electron.ipcMain;

// One animation at a time
const AnimationQueue = function () {
  this.queue = [];
  this.running = false
};

AnimationQueue.prototype.push = function (object) {
  if (this.running) {
    this.queue.push(object);
  } else {
    this.running = true;
    this.animate(object)
  }
};

/**
 * @param {{func:function,args:array}} object
 */
AnimationQueue.prototype.animate = function (object) {
  const self = this;
  Promise.resolve().then(function () {
    return object.func.apply(null, object.args);
  }).then(function () {
    if (self.queue.length > 0) {
      // Run next animation
      self.animate.call(self, self.queue.shift())
    } else {
      self.running = false
    }
  }).catch(function (err) {
    console.error('animate error', err);
  });
};

AnimationQueue.prototype.clear = function () {
  this.queue.splice(0);
};

const config = {
  width: 352,
  height: 78,
  padding: 10,
  borderRadius: 5,
  displayTime: 6000,
  animationSpeed: 700,
  animationFps: 60,
  appIcon: null,
  defaultStyleContainer: {
    padding: 8
  },
  defaultWindow: {
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    frame: false,
    transparent: true,
    acceptFirstMouse: true,
    webPreferences: {
      allowDisplayingInsecureContent: true
    }
  }
};

function setConfig(customConfig) {
  Object.assign(config, customConfig);
  if (!config.templatePath) {
    config.templatePath = 'data:text/html;charset=utf-8,' + encodeURIComponent(fs.readFileSync(path.join(__dirname, 'notification.html')));
  }
  calcDimensions()
}

function getTemplatePath() {
  return config.templatePath
}

function setTemplatePath(path) {
  config.templatePath = path
}

const nextInsertPos = {
  x: null, y: null
};

function calcDimensions() {
  // Calc totalHeight & totalWidth
  config.totalHeight = config.height + config.padding;
  config.totalWidth = config.width + config.padding;

  // Calc pos of first notification:
  config.firstPos = {
    x: config.lowerRightCorner.x - config.totalWidth,
    y: config.lowerRightCorner.y - config.totalHeight
  };

  // Set nextInsertPos
  nextInsertPos.x = config.firstPos.x;
  nextInsertPos.y = config.firstPos.y;
}

function setupConfig() {
  // Use primary display only
  const display = electron.screen.getPrimaryDisplay();

  // Display notifications starting from lower right corner
  // Calc lower right corner
  config.lowerRightCorner = {};
  config.lowerRightCorner.x = display.bounds.x + display.workArea.x + display.workAreaSize.width;
  config.lowerRightCorner.y = display.bounds.y + display.workArea.y + display.workAreaSize.height;

  calcDimensions();

  // Maximum amount of Notifications we can show:
  config.maxVisibleNotifications = Math.floor(display.workAreaSize.height / config.totalHeight);
  config.maxVisibleNotifications = config.maxVisibleNotifications > 7 ? 7 : config.maxVisibleNotifications;
}

setupConfig();

// Array of windows with currently showing notifications
const activeNotifications = [];

// If we cannot show all notifications, queue them
const notificationQueue = [];

// To prevent executing mutliple animations at once
const animationQueue = new AnimationQueue();

// Give each notification a unique id
let latestID = 1;

/**
 * @param {Object} notification
 * @return {number}
 */
function notify(notification) {
  notification.id = latestID++;
  animationQueue.push({
    func: showNotification,
    args: [notification]
  });
  return notification.id;
}

function showNotification(notificationObj) {
  // Can we show it?
  if (activeNotifications.length < config.maxVisibleNotifications) {
    // Get inactiveWindow or create new:
    return getWindow().then(function (notificationWindow) {
      // Move window to position
      calcInsertPos();
      notificationWindow.setPosition(nextInsertPos.x, nextInsertPos.y);

      // Add to activeNotifications
      activeNotifications.push(notificationWindow);

      notificationWindow.on('closed', () => {
        const pos = activeNotifications.indexOf(notificationWindow);
        if (pos !== -1) {
          activeNotifications.splice(pos, 1);
          checkForQueuedNotifications();
          moveOneDown(pos);
        }
      });

      // Display time per notification basis.
      const displayTime = notificationObj.displayTime ? notificationObj.displayTime : config.displayTime;

      // Set timeout to hide notification
      let timeoutId;
      const closeFunc = buildCloseNotification(notificationWindow.id, notificationObj, function () {
        return timeoutId
      });
      timeoutId = setTimeout(function () {
        closeFunc('timeout')
      }, displayTime);

      // Trigger onShowFunc if existent
      if (notificationObj.onShowFunc) {
        notificationObj.onShowFunc({
          event: 'show',
          id: notificationObj.id,
          closeNotification: closeFunc
        })
      }

      // Save onClickFunc in notification window
      if (notificationObj.onClickFunc) {
        notificationWindow.electronNotifyOnClickFunc = notificationObj.onClickFunc
      }

      if (notificationObj.onCloseFunc) {
        notificationWindow.electronNotifyOnCloseFunc = notificationObj.onCloseFunc
      }

      // Set contents, ...
      notificationWindow.webContents.send('electron-notify-set-contents', notificationObj);
      // Show window
      notificationWindow.showInactive();

      return notificationWindow;
    });
  } else { // Add to notificationQueue
    notificationQueue.push(notificationObj);
  }
}

// Close notification function
function buildCloseNotification(winId, notificationObj, getTimeoutId) {
  return function (event) {
    event = event || 'closedByAPI';
    const notificationWindow = BrowserWindow.fromId(winId);
    if (notificationWindow) {
      if (notificationWindow.electronNotifyOnCloseFunc) {
        notificationWindow.electronNotifyOnCloseFunc({
          event: event,
          id: notificationObj.id
        });
      }

      if (getTimeoutId && typeof getTimeoutId === 'function') {
        const timeoutId = getTimeoutId();
        clearTimeout(timeoutId)
      }

      // Hide notification
      notificationWindow.hide();

      notificationWindow.destroy();
    }
  }
}

ipc.on('electron-notify-close', function (event, winId, notificationObj) {
  const closeFunc = buildCloseNotification(winId, notificationObj);
  closeFunc('close')
});

ipc.on('electron-notify-click', function (event, winId, notificationObj) {
  if (notificationObj.url) {
    electron.shell.openExternal(notificationObj.url)
  }
  const notificationWindow = BrowserWindow.fromId(winId);
  if (notificationWindow && notificationWindow.electronNotifyOnClickFunc) {
    const closeFunc = buildCloseNotification(winId, notificationObj);
    notificationWindow.electronNotifyOnClickFunc({
      event: 'click',
      id: notificationObj.id,
      closeNotification: closeFunc
    });
  }
});

/*
* Checks for queued notifications and add them
* to AnimationQueue if possible
*/
function checkForQueuedNotifications() {
  if (notificationQueue.length > 0 &&
    activeNotifications.length < config.maxVisibleNotifications) {
    // Add new notification to animationQueue
    animationQueue.push({
      func: showNotification,
      args: [notificationQueue.shift()]
    })
  }
}

/*
* Moves the notifications one position down,
* starting with notification at startPos
*
* @param  {int} startPos
*/
function moveOneDown(startPos) {
  if (startPos >= activeNotifications || startPos === -1) {
    return;
  }
  // Build array with index of affected notifications
  for (let i = startPos; i < activeNotifications.length; i++) {
    let winId = null;
    try {
      winId = activeNotifications[i].id;
    } catch (err) {
      console.error('moveOneDown error', err);
    }
    if (winId !== null) {
      moveNotificationAnimation(winId, i);
    }
  }
}

function moveNotificationAnimation(winId, i) {
  const notificationWindow = BrowserWindow.fromId(winId);
  if (!notificationWindow) return;

  const [posX, posY] =  notificationWindow.getPosition();
  const newPosY = config.lowerRightCorner.y - config.totalHeight * (i + 1);
  const delta = Math.max(newPosY, posY) - Math.min(newPosY, posY);
  const direction = newPosY > posY ? 1 : -1;
  const startTime = Date.now();
  const endTime = startTime + delta / config.animationSpeed * 1000;
  const timeDelta = endTime - startTime;
  const speed = 1000 / config.animationFps;
  if (!isFinite(timeDelta) || timeDelta === 0) return;

  const next = function () {
    const notificationWindow = BrowserWindow.fromId(winId);
    if (!notificationWindow) return;

    let percents = 100 / timeDelta * (Date.now() - startTime);
    if (percents > 100) {
      percents = 100;
    }
    const deltaPosY = Math.trunc(delta / 100 * percents);
    if (deltaPosY > 0) {
      notificationWindow.setPosition(posX, posY + deltaPosY * direction);
    }
    if (percents < 100) {
      return new Promise(resolve => setTimeout(resolve, speed)).then(next);
    }
  };
  return Promise.resolve().then(next);
}

/*
* Find next possible insert position (on top)
*/
function calcInsertPos() {
  if (activeNotifications.length < config.maxVisibleNotifications) {
    nextInsertPos.y = config.lowerRightCorner.y - config.totalHeight * (activeNotifications.length + 1)
  }
}

/*
* Get a window to display a notification.
* create a new window
* @return {Window}
*/
function getWindow() {
  return new Promise(function (resolve) {
    const windowProperties = config.defaultWindow;
    windowProperties.width = config.width;
    windowProperties.height = config.height;
    const notificationWindow = new BrowserWindow(windowProperties);

    // Open the DevTools.
    if (0) {
      notificationWindow.webContents.openDevTools({
        mode: 'detach'
      });
    }

    notificationWindow.setVisibleOnAllWorkspaces(true);
    notificationWindow.loadURL(getTemplatePath());
    notificationWindow.webContents.on('did-finish-load', function () {
      // Done
      notificationWindow.webContents.send('electron-notify-load-config', config);
      resolve(notificationWindow)
    });
  });
}

function closeAll() {
  // Clear out animation Queue and close windows
  animationQueue.clear();
  activeNotifications.forEach(function (window) {
    window.close()
  });
  // Reset certain vars
  nextInsertPos.x = null;
  nextInsertPos.y = null;
  activeNotifications.splice(0);
}

module.exports.notify = notify;
module.exports.setConfig = setConfig;
module.exports.getTemplatePath = getTemplatePath;
module.exports.setTemplatePath = setTemplatePath;
module.exports.closeAll = closeAll;
# electron-notify-99
*Simple notification polyfill for electron apps*

## Usage

```JavaScript
const eNotify = require('electron-notify-99');
// Change config options
eNotify.setConfig({
    appIcon: path.join(__dirname, 'images/icon.png'),
    displayTime: 6000
});

// Send simple notification
eNotify.notify({ title: 'Notification title', text: 'Some text' });
// Send simple notification with subtext
eNotify.notify({ title: 'Notification title', text: 'Some text', subtext: 'Some subtext' });

// See more in source code, I'm lazy
```

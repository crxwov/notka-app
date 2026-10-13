// Local Telegram WebApp bridge for Notka Android application
(function() {
  if (!window.Telegram) window.Telegram = {};
  if (!window.Telegram.WebApp) {
    var webApp = {
      initData: "",
      get initDataUnsafe() {
        var u = null;
        try {
          var raw = localStorage.getItem("notka_auth_user");
          if (raw) u = JSON.parse(raw);
        } catch (e) {}
        return { user: u };
      },
      version: "8.0",
      platform: "android",
      colorScheme: "dark",
      themeParams: {
        bg_color: "#0C0A12",
        text_color: "#FFFFFF",
        hint_color: "#8E88A0",
        link_color: "#C38FFF",
        button_color: "#8B5CF6",
        button_text_color: "#FFFFFF",
        secondary_bg_color: "#16131F"
      },
      isExpanded: true,
      viewportHeight: window.innerHeight,
      viewportStableHeight: window.innerHeight,
      headerColor: "#0C0A12",
      backgroundColor: "#0C0A12",
      bottomBarColor: "#0C0A12",
      isClosingConfirmationEnabled: false,
      isVerticalSwipesEnabled: false,
      BackButton: {
        isVisible: false,
        _cb: null,
        onClick: function(cb) { this._cb = cb; },
        offClick: function(cb) { if (this._cb === cb) this._cb = null; },
        show: function() { this.isVisible = true; if (window.NotkaAndroid && window.NotkaAndroid.setBackButtonVisible) window.NotkaAndroid.setBackButtonVisible(true); },
        hide: function() { this.isVisible = false; if (window.NotkaAndroid && window.NotkaAndroid.setBackButtonVisible) window.NotkaAndroid.setBackButtonVisible(false); },
        _trigger: function() {
          if (typeof this._cb === "function") {
            try { this._cb(); return true; } catch (e) { console.error("BackButton error", e); }
          }
          return false;
        }
      },
      MainButton: {
        isVisible: false,
        text: "",
        show: function(){ this.isVisible = true; },
        hide: function(){ this.isVisible = false; },
        setText: function(t){ this.text = t; },
        onClick: function(cb){ this._cb = cb; }
      },
      HapticFeedback: {
        impactOccurred: function(style) {
          if (window.NotkaAndroid && window.NotkaAndroid.hapticImpact) {
            window.NotkaAndroid.hapticImpact(style || "light");
          }
        },
        notificationOccurred: function(type) {
          if (window.NotkaAndroid && window.NotkaAndroid.hapticNotification) {
            window.NotkaAndroid.hapticNotification(type || "success");
          }
        },
        selectionChanged: function() {
          if (window.NotkaAndroid && window.NotkaAndroid.hapticSelection) {
            window.NotkaAndroid.hapticSelection();
          }
        }
      },
      ready: function() {
        if (window.NotkaAndroid && window.NotkaAndroid.onAppReady) {
          window.NotkaAndroid.onAppReady();
        }
      },
      expand: function() {},
      close: function() {
        if (window.NotkaAndroid && window.NotkaAndroid.closeApp) {
          window.NotkaAndroid.closeApp();
        }
      },
      setHeaderColor: function(c) {
        if (window.NotkaAndroid && window.NotkaAndroid.setHeaderColor) {
          window.NotkaAndroid.setHeaderColor(c);
        }
      },
      setBackgroundColor: function(c) {
        if (window.NotkaAndroid && window.NotkaAndroid.setBackgroundColor) {
          window.NotkaAndroid.setBackgroundColor(c);
        }
      },
      setBottomBarColor: function(c) {},
      enableClosingConfirmation: function() {},
      disableClosingConfirmation: function() {},
      disableVerticalSwipes: function() {},
      enableVerticalSwipes: function() {},
      isVersionAtLeast: function(v) { return true; },
      openLink: function(url) {
        if (window.NotkaAndroid && window.NotkaAndroid.openExternal) {
          window.NotkaAndroid.openExternal(url);
        } else {
          window.open(url, "_blank");
        }
      },
      openTelegramLink: function(url) {
        if (window.NotkaAndroid && window.NotkaAndroid.openExternal) {
          window.NotkaAndroid.openExternal(url);
        } else {
          window.open(url, "_blank");
        }
      },
      showPopup: function(p, cb) {
        alert(p.message || p.title || "");
        if (cb) cb();
      },
      showAlert: function(msg, cb) {
        alert(msg);
        if (cb) cb();
      },
      showConfirm: function(msg, cb) {
        var res = confirm(msg);
        if (cb) cb(res);
      }
    };
    window.Telegram.WebApp = webApp;
  }
})();

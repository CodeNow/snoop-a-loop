module.exports = class BrowserActions {

  static setup () {
    window.alert('SETUP')
    window.inject = function (serviceName) {
      var service = window.angular.element(document.body).injector().get(serviceName);
      window[serviceName] = service;
      return service;
    }
  }

  static loginToRunnable (host, accessToken) {
    window.inject('$http')
    return $http.post(
        host, '/auth/github/token',
        {accessToken: accessToken}
    )
  }

  static alertConfigAPIHost () {
    alert('alertConfigAPIHost')
    alert(window.inject)
    window.inject('configAPIHost')
    alert(window.configAPIHost)
  }
}

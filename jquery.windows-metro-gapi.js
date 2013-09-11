var GLOBAL_CLIENT_ID = YOUR_CLIENT_ID;
var GLOBAL_CLIENT_SECRET = 'YOUR_CLIENT_SECRET';

// Comma-separated list of scopes that you want a token for
var GLOBAL_GAPI_SCOPES = 'https://www.googleapis.com/auth/youtube';

var GLOBAL_GAPI_AUTH_URL = "https://accounts.google.com/o/oauth2/auth"
                        + "?response_type=code"
                        + "&redirect_uri=http://localhost"
                        + "&client_id=" + GLOBAL_CLIENT_ID
                        + "&scope=" + GLOBAL_GAPI_SCOPES;

(function ($) {
    /**
     * A wrapper for jQuery.ajax. This takes no extra arguments. On the first call, if no token is found in WinJS.Application.sessionState.token, it will automatically attempt to open a Windows Metro authentication screen to grab a token for the requested scopes.
     * This is most likely the only function from this library that you will ever call externally, since it automatically calls jQuery.gapi_authenticate if no token is found.
     * @param url the URL to send a request to
     * @param options this parameter works in exactly the same way as jQuery.ajax's second parameter, EXCEPT that if you pass it an error callback, it should be able to handle a special error returned if no token could be retrieved (e.g., if the user denied permission to the application). The text of this error is "Could not retrieve auth token".
     */
    $.gapi = function (url, options) {
        // Store an unmodified copy in case we have to refresh our token and re-call this function later
        var copy = { url: url, options: options };

        // Wrap $.ajax into a function that will auto-refresh a token if need be
        // check for token first
        options.error = options.error instanceof Function ? options.error : function (str) { };
        if (!WinJS.Application.sessionState.token) {
            // haven't authenticated yet!
            $.gapi_authenticate(GLOBAL_GAPI_AUTH_URL, function () {
                $.gapi(copy.url, copy.options);
            }, function () {
                options.error("Could not retrieve auth token");
            });
            return;
        }

        if (!options.headers) options.headers = {};
        options.headers.Authorization = WinJS.Application.sessionState.token.token_type + " " + WinJS.Application.sessionState.token.access_token;

        options.error = function () {
            $.gapi_refresh_token(function () {
                $.gapi(copy.url, copy.options);
            });
        }

        $.ajax(url, options);
    };

    /**
     * This refreshes the token currently stored in WinJS.Application.sessionState.token.
     * @param success a function to call after the token is refreshed successfully
     * @param error a function to call if there is an error refreshing the token
     */
    $.gapi_refresh_token = function (success, error) {
        $.ajax("https://accounts.google.com/o/oauth2/token", {
            type: "post",
            data: {
                client_id: GLOBAL_CLIENT_ID,
                client_secret: GLOBAL_CLIENT_SECRET,
                refresh_token: WinJS.Application.sessionState.token.refresh_token,
                grant_type: "refresh_token"
            },
            dataType: 'json',
            success: function (response) {
                response.refresh_token = WinJS.Application.sessionState.token.refresh_token;
                WinJS.Application.sessionState.token = response;
                Windows.Storage.ApplicationData.current.roamingSettings.token = response; // This is so we can retrieve the token if the app is suspended and restarted
                if (success instanceof Function) success(response);
            }
        });
    };

    /**
     * Given an auth code from /o/oauth2/auth, asks google for a token that it can use to perform authenticated operations on a Google API.
     * @param auth_code the auth code from /o/oauth2/auth
     * @param success a function to call after the token is obtained successfully
     * @param error a function to call if there is an error obtaining the token
     */
    $.gapi_token_from_auth_code = function (auth_code, success, error) {
        $.ajax("https://accounts.google.com/o/oauth2/token", {
            type: "post",
            data: {
                code: auth_code,
                client_id: GLOBAL_CLIENT_ID,
                client_secret: GLOBAL_CLIENT_SECRET,
                redirect_uri: "http://localhost",
                grant_type: "authorization_code"
            },
            dataType: 'json',
            success: function (response) {
                // Store the token globally for use in $.gapi
                WinJS.Application.sessionState.token = response;
                if (success instanceof Function) success(response);
            },
            error: error
        });
    };

    /**
     * Opens a Windows Metro Authentication prompt that queries the given url (generally /o/oauth2/auth) for an auth code.
     * @param url the authentication URL to query
     * @param success a function to call if the auth code is obtained successfully
     * @param error a function to call if there is an error obtaining the auth code (e.g. the user refuses your app access to his account)
     */
    $.gapi_authenticate = function (url, success, error) {
        error = error instanceof Function ? error : function (str) { };

        var startURI = Windows.Foundation.Uri(url);
        var endURI = Windows.Foundation.Uri("http://localhost");

        Windows.Security.Authentication.Web.WebAuthenticationBroker.authenticateAsync(
                    Windows.Security.Authentication.Web.WebAuthenticationOptions.none, startURI, endURI)
                    .done(function (result) {
                        var url = result.responseData;

                        // split off the GET variables that were passed to the url
                        var get_vars = url.substring(url.indexOf('?') + 1, url.length).split('&');
                        var vars = {};
                        get_vars.forEach(function (pair) {
                            var kv = pair.split('=');
                            vars[kv[0]] = kv[1];
                        });

                        // awesome, we have an auth code, let's get a real access token now
                        $.gapi_token_from_auth_code(vars.code, success);

                        if (result.responseStatus === Windows.Security.Authentication.Web.WebAuthenticationStatus.errorHttp) {
                            error(result.responseErrorDetail);
                        }
                    }, function (err) {
                        error(err.message);
                    });
    }

    // Call an initial gapi call which will force the app to authenticate if there is no token yet
    $.gapi("https://www.googleapis.com/youtube/v3/playlists?part=snippet&mine=true", {
        success: function (response) {
            var playlists = response.items;
            if (playlists) {
                var appData = Windows.Storage.ApplicationData.current;
                var roamingSettings = appData.roamingSettings;

                // Handle first time initialization of the playlist group.
                var playlists_group = Data.playlists_group;

                playlists.forEach(function (pl) {
                    var snippet = pl.snippet;
                    console.log(JSON.stringify(snippet));
                    Data.originalList.push({
                        etag: pl.etag,
                        id: pl.id,
                        group: playlists_group,
                        channel: {
                            id: snippet.channelId,
                            title: snippet.channelTitle
                        },
                        title: snippet.title,
                        subtitle: "",
                        description: snippet.description,
                        content: "",
                        backgroundImage: snippet.thumbnails.high.url,
                        songs: []
                    });
                });
            }
        },
        error: function (response) {
            console.log(JSON.stringify(response), "Error");
        },
        dataType: "json"
    });
})(jQuery);
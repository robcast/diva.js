import { elt } from '../utils/elt';

/**
 * A simple authentication plugin. 
 * 
 * Based on parts of IIIF-Auth API but with access control on the manifest. 
 * 
 * Requires IIIF-Auth API compliant Access Cookie Service (settings.simpleAuthLoginUrl)
 * and Access Token Service (settings.simpleAuthTokenUrl).
 * (see https://iiif.io/api/auth/1.0/)
 * 
 * 1. Diva tries to load the manifest normally.
 * 2. If loading the manifest fails with an authorization error the plugin requests an access token.
 * 2a. If loading the access token fails the plugin shows a login dialog and requests a new token.
 * 3. Diva tries to load the manifest with the access token.
 * 4. If loading the manifest fails with the access token the plugin shows a login dialog and requests a new token.
 * 5. The images are loaded using the cookies set by the login domain.
 *  
 **/
export default class SimpleAuthPlugin
{
    constructor (core)
    {
        this.core = core;
        this.toolbarIcon = this.createIcon();
        this.toolbarSide = 'right';
        this.authTokenUrl = core.settings.simpleAuthTokenUrl;
        this.authLoginUrl = core.settings.simpleAuthLoginUrl;
        this.authToken = null;
        this.authError = null;
        this.authTokenId = null;
        this.serviceOrigin = this.getOrigin(this.authTokenUrl);

        /*
         * Manifest load error handler.
         * 
         * Re-tries load with auth token or shows log in window. 
         */
        Diva.Events.subscribe("ManifestFetchError", (response) => {
        	if (response.status == 401) {
            	if (this.authToken == null && this.authError == null) {
            		// no auth token. let's get one
            		this.requestAuthToken();
            		// abort regular error message
            		throw new Error("cancel error handler");
            	} else {
            		// auth token doesn't work. try to log in again
            		this.showLoginMessage(response);
            		// abort regular error message
            		throw new Error("cancel error handler");
            	}
        	}
        }, core.settings.ID);
        
        /*
         * postMessage event handler.
         * 
         * Receives data from IIIF-Auth token service in iframe.
         * (https://iiif.io/api/auth/1.0/#interaction-for-browser-based-client-applications)
         */
        window.addEventListener("message", (event) => {
            let origin = event.origin;
            let data = event.data;
            //console.debug("received postMessage!", origin, data);
            
            if (origin != this.serviceOrigin) return;
            
            if (data.messageId != this.authTokenId) return;
            
            if (data.hasOwnProperty('accessToken')) 
            {
            	this.authToken = data.accessToken;
                this.authError = null;
                this.setAuthHeader(data.accessToken);
                // reload manifest
                this.core.publicInstance._loadOrFetchObjectData();
            } 
            else if (data.hasOwnProperty('error')) 
            {
                // handle error condition
            	console.debug("ERROR getting access token!");
            	this.authError = data.error;
            	this.authToken = null;
            	this.setAuthHeader(null);
            	// reload manifest to trigger login window
                this.core.publicInstance._loadOrFetchObjectData();
            }
        });
    }

    /**
     * Show login required message with button to open login window.
     */
    showLoginMessage (response)
    {
        const errorMessage = ['Unauthorized request. Error code: ' + response.status + ' ' + response.statusText];
        errorMessage.push(
            elt('p', 'The document you are trying to access requires authentication.'),
            elt('p', 'Please ',
            	elt('button', this.core.elemAttrs('error-auth-login', {'aria-label': 'Log in'}), 'log in')
    		));
        
        this.core.showError(errorMessage);
        
        // connect login button
        let selector = '#' + this.core.settings.selector;
        document.querySelector(selector + 'error-auth-login').addEventListener('click', () =>
        {
            this.openLoginWindow();
            // close error message
            let errorElement =  document.querySelector(selector + 'error');
            errorElement.parentNode.removeChild(errorElement);
        });
    }

    /**
     * Open new window with login url and re-request token after it closes.
     */
    openLoginWindow () 
    {
		const loginWindow = window.open(this.authLoginUrl);
		
		if (loginWindow == null) 
		{
			console.error("login service window did not open :-(");
			return;
		}
		
        // we need to wait for the window to close...
        const poll = window.setInterval( () => {
            if (loginWindow.closed) 
            {
                window.clearInterval(poll);
                // request a token with the new cookies
                this.requestAuthToken();
            }
        }, 500);
    }
    
    /**
     * Request a new authentication token.
     * 
     * Creates iframe with the token service url.
     * Should trigger receiveMessage with the token.
     */
    requestAuthToken ()
    {
    	const tokenFrameId = 'iiif-token-frame';
        let tokenFrame = document.getElementById(tokenFrameId);
        if (tokenFrame == null) 
        {
        	tokenFrame = document.createElement('iframe');
        	tokenFrame.id = tokenFrameId;
            tokenFrame.setAttribute('style', 'display:none; width:30px; height:10px;');
            document.body.appendChild(tokenFrame);
        }

        // use utime as token id
        this.authTokenId = Date.now();
        // create url with id and origin
        const tokenUrl = this.authTokenUrl + "?messageId=" + this.authTokenId + "&origin=" + this.getOrigin();
        // load url in iframe
        tokenFrame.src = tokenUrl;
    }

    /**
     * Determine the postMessage-style origin for a URL.
     */ 
    getOrigin (url) 
    {
        let urlHolder = window.location;
        if (url) 
        {
            urlHolder = document.createElement('a');
            urlHolder.href = url;
        }
        return urlHolder.protocol + "//" + urlHolder.hostname + (urlHolder.port ? ':'+urlHolder.port : '');
    }
    
    /**
     * Set the Authorization header.
     */
    setAuthHeader (token) 
    {
    	if (token != null)
    	{
    		this.core.settings.addRequestHeaders = this.core.settings.addRequestHeaders || {};
    		this.core.settings.addRequestHeaders["Authorization"] = "Bearer " + token;
    	}
    	else if (this.core.settings.addRequestHeaders != null)
		{
    		delete this.core.settings.addRequestHeaders["Authorization"];
		}
    }
    
    /**
     * Clicking the icon opens a login window if necessary.
     **/
    handleClick ()
    {
    	if (this.authToken == null || this.authError != null)
    	{
    		this.openLoginWindow();
    	}
    }

    createIcon ()
    {
        /*
        * See img/download.svg for the standalone source code for this.
        * */

        const toolbarIcon = document.createElement('div');
        toolbarIcon.classList.add('diva-simpleauth-icon', 'diva-button');

        let root = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        root.setAttribute("x", "0px");
        root.setAttribute("y", "0px");
        root.setAttribute("viewBox", "0 0 25 25");
        root.id = `${this.core.settings.selector}download-icon`;

        let g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.id = `${this.core.settings.selector}download-icon-glyph`;
        g.setAttribute("transform", "matrix(1, 0, 0, 1, -11.5, -11.5)");
        g.setAttribute("class", "diva-pagetool-icon");

        let path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M36.25,24c0,6.755-5.495,12.25-12.25,12.25S11.75,30.755,11.75,24S17.245,11.75,24,11.75S36.25,17.245,36.25,24z M33,24c0-4.963-4.037-9-9-9s-9,4.037-9,9s4.037,9,9,9S33,28.963,33,24z M29.823,23.414l-5.647,7.428c-0.118,0.152-0.311,0.117-0.428-0.035L18.1,23.433C17.982,23.28,18.043,23,18.235,23H21v-4.469c0-0.275,0.225-0.5,0.5-0.5h5c0.275,0,0.5,0.225,0.5,0.5V23h2.688C29.879,23,29.941,23.263,29.823,23.414z");

        g.appendChild(path);
        root.appendChild(g);

        toolbarIcon.appendChild(root);

        return toolbarIcon;
    }
}

SimpleAuthPlugin.prototype.pluginName = "simple-auth";
SimpleAuthPlugin.prototype.isPageTool = false;

/**
 * Make this plugin available in the global context
 * as part of the 'Diva' namespace.
 **/
(function (global)
{
    global.Diva.SimpleAuthPlugin = SimpleAuthPlugin;
})(window);

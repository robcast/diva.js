import { elt } from '../utils/elt';
/**
 * A simple authentication plugin.
 *  
 **/
export default class SimpleAuthPlugin
{
    constructor (core)
    {
        this.core = core;
        this.toolbarIcon = this.createIcon();
        this.toolbarSide = 'right';
        this.iiifTokenUrl = core.settings.simpleAuthTokenUrl;
        this.iiifLoginUrl = core.settings.simpleAuthLoginUrl;
        this.authToken = null;
        this.authError = null;
        this.authTokenId = null;

        Diva.Events.subscribe("ManifestWillLoad", (data) => {
        	console.debug("ManifestWillLoad", data);
        	if (this.authTokenId != null && this.authToken == null && this.authError == null) {
        		console.debug("authentication still in flight!");
        	}
        }, core.settings.ID);

        Diva.Events.subscribe("ManifestDidNotLoad", (response) => {
        	console.debug("ManifestDidNotLoad", response);
        	if (response.status == 401) {
            	if (this.authTokenId != null && this.authToken == null && this.authError == null) {
            		console.debug("authentication still in flight. Let's wait...");
            		throw "error";
            	}
            	if (this.authToken != null && this.authError == null) {
            		console.debug("authentication is ok let's wait...");
            		throw "error";
            	}        		
        		console.debug("need to authenticate!");
        		this._ajaxError(response);
        		//this.handleClick();
        	}        	
        }, core.settings.ID);
        
        // add postMessage event handler for IIIF token service
        window.addEventListener("message", this.receiveMessageHandler(core.settings));
        // get a token now
        this.requestAuthToken();
    }

    onManifestWillLoad (data) 
    {
    	console.debug("ManifestWillLoad", data);
    }
    
    onManifestDidNotLoad (response) 
    {
    }
    
    _ajaxError (response)
    {
        // Show a basic error message within the document viewer pane
        const errorMessage = ['Unauthorized request. Error code: ' + response.status + ' ' + response.statusText];
        errorMessage.push(
                elt('p', 'The document you are trying to access requires authentication.'),
                elt('p', 'Please try to ',
                	elt('button', this.core.elemAttrs('error-auth-login', {'aria-label': 'Close dialog'}), 'login')
        		));

        this.core.showError(errorMessage);
        document.querySelector('#' + this.core.settings.selector + 'error-auth-login').addEventListener('click', () =>
        {
            this.handleClick();
        });
        throw "error";
    }

    
    /**
     * Open a new window with the login screen if necessary.
     *
     **/
    handleClick ()
    {
    	if (this.authToken == null || this.authError != null)
    	{
    		let loginWindow = window.open(this.iiifLoginUrl);
    		if (loginWindow == null) {
    			console.debug("login window did not open :-(");
    			return;
    		}
            // we need to wait for the window to close...
            let poll = window.setInterval( () => {
                if (loginWindow.closed) {
                    console.debug("login service window is now closed");
                    window.clearInterval(poll);
                    this.requestAuthToken();
                    // TODO: reload when token resolved...
                }
            }, 500);
    	}
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
            tokenFrame.setAttribute('style', 'display:none; width:300px; height:100px;');
            document.body.appendChild(tokenFrame);
        }

        this.authTokenId = Date.now();
        let tokenUrl = this.iiifTokenUrl + "?messageId=" + this.authTokenId + "&origin=" + this.getOrigin();
        tokenFrame.src = tokenUrl;
        console.debug("set token frame to "+tokenUrl);
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
     * Return handler function for postMessage.
     * 
     * The handler checks the message and updates the access token.
     */
    receiveMessageHandler (settings) 
    {
        let serviceOrigin = this.getOrigin(this.iiifTokenUrl);
        
    	return  (event) => {
            let origin = event.origin;
            let data = event.data;
            console.debug("received postMessage!", origin, data);
            
            if (origin != serviceOrigin) return;
            
            if (data.messageId != this.authTokenId) return;
            
            if (data.hasOwnProperty('accessToken')) 
            {
                this.setAccessToken(data.accessToken);
                this.authError = null;
                console.debug("reload viewer!");
                this.core.publicInstance._loadOrFetchObjectData();
            } 
            else if (data.hasOwnProperty('error')) 
            {
                // handle error condition
            	console.debug("ERROR getting access token!");
            	this.setAccessToken(null);
            	this.authError = data.error;
            }
        }
    }

    /**
     * Set the access token.
     * 
     * Updates the Authorization in the request header.
     */
    setAccessToken (token) 
    {
    	this.authToken = token;
    	if (token != null)
    	{
    		this.core.settings.addRequestHeaders = {
    			"Authorization": "Bearer " + token
    		};
    	}
    	else
		{
    		this.core.settings.addRequestHeaders = null;
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

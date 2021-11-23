/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Ajax handlers (invoked by router to return JSON data)                                          */
/*                                                                                                */
/* All functions here should set body, and status if not 200, and should not throw (as that would */
/* invoke the generic admin exception handler which would return an html page).                   */
/*                                                                                                */
/* Generic ajax functionality gets passed through to be handled by the API via the                */
/* ajaxApiPassthrough() function.                                                                 */
/*                                                                                                */
/* Being placed after auth test in the middleware stack, ajax calls are password-protected.       */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import fetch from 'node-fetch'; // window.fetch in node.js


class AjaxHandlers {

    /*
     * Routes/handlers for app-specific ajax calls can go here; this sample app has none.
     */


    /*
     * This provides an interface to the 'api' app, hence providing a RESTful-structured ajax service;
     * e.g. GET admin.app.com/ajax/members/123456 => GET api.app.com/members/123456
     *
     * It uses the same JSON Web Token to authenticate as was used for website sign-in.
     */
    static async ajaxApiPassthrough(ctx) {
        const resource = ctx.request.url.replace('/ajax/', '');
        const host = ctx.request.host.replace('admin', 'api');
        const url = ctx.request.protocol + '://' + host + '/' + resource;

        const body = JSON.stringify(ctx.request.body) == '{}' ? null : JSON.stringify(ctx.request.body);
        const hdrs = {
            'Content-Type':  'application/json',
            'Accept':        ctx.request.header.accept || '*/*',
            'Authorization': 'Bearer ' + ctx.state.auth.jwt,
        };

        try {
            const response = await fetch(url, {
                method:  ctx.request.method,
                body:    body,
                headers: hdrs,
            });
            const json = response.headers.get('content-type').match(/application\/json/);
            ctx.response.status = response.status;
            ctx.response.body = json ? await response.json() : await response.text();
        } catch (e) { // eg offline, DNS fail, etc
            ctx.response.status = 500;
            ctx.response.body = e.message;
        }
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default AjaxHandlers;

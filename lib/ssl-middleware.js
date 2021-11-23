/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* SSL middleware - force use of SSL.                                                             */
/*                                                                                                */
/* If app is running on full server, this is more easily done with e.g. Nginx, but if running on  */
/* Heroku, Heroku provides no means of doing this, so the application must look after it itself.  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


class Ssl {

    /**
     * Force SSL; if protocol is http and NODE_ENV is production, redirect to same url
     * using https.
     *
     * Note if app.proxy is true, ctx.request.secure will respect X-Forwarded-Proto, hence
     * opt.trustProxy is implied.
     *
     * qv github.com/jclem/koa-ssl, github.com/turboMaCk/koa-sslify
     *
     * @param {boolean} options.disabled=NODE_ENV!='production' - If true, all requests will be
     *   allowed through.
     * @param {boolean} options.trustProxy=false - If true, trust the x-forwarded-proto header; qv
     *   devcenter.heroku.com/articles/http-routing#heroku-headers.
     */
    static force(options) {
        const defaults = { disabled: process.env.NODE_ENV != 'production', trustProxy: false };
        const opt = { ...defaults, ...options };

        return async function sslMiddleware(ctx, next) {
            if (opt.disabled) { // nothing to do
                await next();
                return;
            }

            const xfp = ctx.request.get('x-forwarded-proto');
            const isSecure = ctx.request.secure || (opt.trustProxy && xfp=='https');

            if (isSecure) { // secure or trusted, all well & good
                await next();
                return;
            }

            if (ctx.request.method=='GET' || ctx.request.method=='HEAD') { // redirect to https equivalent
                ctx.response.status = 301; // Moved Permanently
                ctx.response.redirect(ctx.request.href.replace(/^http/, 'https'));
                return;
            }

            ctx.response.status = 403; // otherwise respond Forbidden
        };
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default Ssl;

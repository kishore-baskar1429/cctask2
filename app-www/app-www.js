/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* 'www' app - publicly available parts of the site                                               */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import Koa        from 'koa';            // koa framework
import body       from 'koa-body';       // body parser
import handlebars from 'koa-handlebars'; // handlebars templating
import flash      from 'koa-flash';      // flash messages
import lusca      from 'koa-lusca';      // security header middleware
import serve      from 'koa-static';     // static file serving middleware
import convert    from 'koa-convert';    // until  koa-flash, koa-lusca updated to v2
import Debug      from 'debug';          // small debugging utility

const debug = Debug('app:req'); // debug each request

import Log from '../lib/log.js';
import Ssl from '../lib/ssl-middleware.js';


const app = new Koa(); // www app


// serve static files (html, css, js); allow browser to cache for 1 day (note css/js req'd before login)
const maxage = app.env=='production' ? 1000*60*60*24 : 1000;
app.use(serve('public', { maxage: maxage }));


// log requests (excluding static files, into mongodb capped collection)
app.use(async function logAccess(ctx, next) {
    debug(ctx.request.method.padEnd(4) + ' ' + ctx.request.url);
    const t1 = Date.now();
    await next();
    const t2 = Date.now();

    await Log.access(ctx, t2 - t1);
});


// handlebars templating
app.use(handlebars({
    extension:   [ 'html', 'handlebars' ],
    viewsDir:    'app-www/templates',
    partialsDir: 'app-www/templates',
}));


// handle thrown or uncaught exceptions anywhere down the line
app.use(async function handleErrors(ctx, next) {
    try {

        await next();

    } catch (err) {
        ctx.response.status = err.status || 500;
        await Log.error(ctx, err);
        if (app.env == 'production') delete err.stack; // don't leak sensitive info!
        switch (ctx.response.status) {
            case 404: // Not Found
                if (err.message == 'Not Found') err.message = 'Couldn’t find that one!...'; // personalised 404
                await ctx.render('404-not-found', { err });
                break;
            default:
            case 500: // Internal Server Error (for uncaught or programming errors)
                await ctx.render('500-internal-server-error', { err });
                // ctx.app.emit('error', err, ctx); // github.com/koajs/koa/wiki/Error-Handling
                break;
        }
    }
});


// parse request body into ctx.request.body
// - multipart allows parsing of enctype=multipart/form-data
app.use(body({ multipart: true }));


// clean up post data - trim & convert blank fields to null
app.use(async function cleanPost(ctx, next) {
    for (const key in ctx.request.body) {
        if (typeof ctx.request.body[key] == 'string') {
            ctx.request.body[key] = ctx.request.body[key].trim();
            if (ctx.request.body[key] == '') ctx.request.body[key] = null;
        }
    }
    await next();
});


// flash messages
app.use(convert(flash())); // note koa-flash@1.0.0 is v1 middleware which generates deprecation notice


// lusca security headers
const luscaCspTrustedCdns = 'ajax.googleapis.com cdnjs.cloudflare.com maxcdn.bootstrapcdn.com';
const luscaCspDefaultSrc = `'self' 'unsafe-inline' ${luscaCspTrustedCdns}`; // 'unsafe-inline' required for <style> blocks
app.use(lusca({
    csp:            { policy: { 'default-src': luscaCspDefaultSrc } }, // Content-Security-Policy
    cto:            'nosniff',                                         // X-Content-Type-Options
    hsts:           { maxAge: 60*60*24*365, includeSubDomains: true }, // HTTP Strict-Transport-Security
    xframe:         'SAMEORIGIN',                                      // X-Frame-Options
    xssProtection:  true,                                              // X-XSS-Protection
    referrerPolicy: 'strict-origin-when-cross-origin',                 // Referrer-Policy
}));


// add the domain (host without subdomain) into koa ctx (used in navpartial template)
app.use(async function ctxAddDomain(ctx, next) {
    ctx.state.domain = ctx.request.host.replace('www.', '');
    await next();
});


// ------------ routing


// force use of SSL (redirect http protocol to https)
app.use(Ssl.force({ trustProxy: true }));


import routesWww from './routes-www.js';
app.use(routesWww);


// end of the line: 404 status for any resource not found
app.use(function notFound(ctx) { // note no 'next'
    ctx.throw(404);
});


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default app;

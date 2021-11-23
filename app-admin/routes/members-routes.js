/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  Members routes                                                                                */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import Router from 'koa-router'; // router middleware for koa

const router = new Router();

import members from '../handlers/members.js';


router.get('/members',             members.list);          // render list members page
router.get('/members/add',         members.add);           // render add a new member page
router.get('/members/:id',         members.view);          // render view member details page
router.get('/members/:id/edit',    members.edit);          // render edit member details page
router.get('/members/:id/delete',  members.delete);        // render delete a member page

router.post('/members/add',        members.processAdd);    // process add member
router.post('/members/:id/edit',   members.processEdit);   // process edit member
router.post('/members/:id/delete', members.processDelete); // process delete member


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default router.middleware();

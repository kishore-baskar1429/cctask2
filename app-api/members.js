/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  API handlers - Members                                                                        */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import Member      from '../models/member.js';
import Db          from '../lib/mysqldb.js';
import castBoolean from './cast-boolean.js';


class MembersHandlers {

    /**
     * @api {get} /members List members
     * @apiName   GetMembers
     * @apiGroup  Members
     *
     * @apiDescription Summary list of members.
     *
     * @apiParam   -filter-field-              Field to be filtered on (eg /members?firstname=fred)
     * @apiHeader  Authorization               Basic Access Authentication token.
     * @apiHeader  [Accept=application/json]   application/json, application/xml, text/yaml, text/plain.
     * @apiSuccess (Success 2xx) 200/OK        List of members with id, uri attributes.
     * @apiSuccess (Success 2xx) 204/NoContent No matching members found.
     * @apiError   403/Forbidden               Unrecognised Member field in query.
     * @apiError   401/Unauthorized            Invalid JWT auth credentials supplied.
     */
    static async getMembers(ctx) {
        try {

            let sql = 'Select * From Member';
            // query-string filters?
            if (ctx.request.querystring) {
                const filter = Object.keys(ctx.request.query).map(function(q) { return q+' = :'+q; }).join(' and ');
                sql += ' Where '+filter;
            }
            sql +=  ' Order By Firstname, Lastname';

            const result = await Db.query(sql, ctx.request.query);
            const [ members ] = castBoolean.fromMysql(result);

            if (members.length == 0) { ctx.response.status = 204; return; } // No Content (preferred to returning 200 with empty list)

            // just id & uri attributes in list
            for (let m=0; m<members.length; m++) {
                members[m] = { _id: members[m].MemberId, _uri: '/members/'+members[m].MemberId };
            }

            ctx.response.body = members;
            ctx.response.body.root = 'Members';

        } catch (e) {
            switch (e.code) {
                case 'ER_BAD_FIELD_ERROR': ctx.throw(403, 'Unrecognised Member field'); break;
                default: throw e;
            }
        }
    }


    /**
     * @api {get} /members/:id Get details of member (including team memberships).
     * @apiName   GetMembersId
     * @apiGroup  Members
     *
     * @apiHeader  Authorization            Basic Access Authentication token.
     * @apiHeader  [Accept=application/json] application/json, application/xml, text/yaml, text/plain.
     * @apiSuccess (Success 2xx) 200/OK     Full details of specified member.
     * @apiError   401/Unauthorized         Invalid JWT auth credentials supplied.
     * @apiError   404/NotFound             Member not found.
     */
    static async getMemberById(ctx) {
        const result = await Db.query('Select * From Member Where MemberId = :id', { id: ctx.params.id });
        const [ members ] = castBoolean.fromMysql(result);
        const member = members[0];

        if (!member) ctx.throw(404, `No member ${ctx.params.id} found`); // Not Found

        // return id as attribute / underscore-field
        member._id = member.MemberId;

        // team membership
        const sql = 'Select TeamId As _id, concat("/teams/",TeamId) As _uri From TeamMember Where MemberId = :id';
        const [ teams ] = await Db.query(sql, { id: ctx.params.id });
        member.Teams = teams;

        ctx.response.body = member;
        ctx.response.body.root = 'Member';
    }


    /**
     * @api {post} /members Create new member
     * @apiName    PostMembers
     * @apiGroup   Members
     *
     * @apiParam   ...                       [as per get].
     * @apiHeader  Authorization             Basic Access Authentication token.
     * @apiHeader  [Accept=application/json] application/json, application/xml, text/yaml, text/plain.
     * @apiHeader  Content-Type              application/x-www-form-urlencoded.
     * @apiSuccess (Success 2xx) 201/Created Details of newly created member.
     * @apiError   401/Unauthorized          Invalid JWT auth credentials supplied.
     * @apiError   403/Forbidden             Admin auth required.
     */
    static async postMembers(ctx) {
        if (ctx.state.auth.Role != 'admin') ctx.throw(403, 'Admin auth required'); // Forbidden

        ctx.request.body = await castBoolean.fromStrings('Member', ctx.request.body);

        const id = await Member.insert(ctx.request.body);

        ctx.response.body = await Member.get(id); // return created member details
        ctx.response.body.root = 'Member';
        ctx.response.set('Location', '/members/'+id);
        ctx.response.status = 201; // Created
    }


    /**
     * @api {patch} /members/:id Update member details
     * @apiName     PatchMembers
     * @apiGroup    Members
     *
     * @apiParam   ...                       [as per get].
     * @apiHeader  Authorization             Basic Access Authentication token.
     * @apiHeader  [Accept=application/json] application/json, application/xml, text/yaml, text/plain.
     * @apiHeader  Content-Type              application/x-www-form-urlencoded.
     * @apiSuccess (Success 2xx) 200/OK      Updated member details.
     * @apiError   401/Unauthorized          Invalid JWT auth credentials supplied.
     * @apiError   403/Forbidden             Admin auth required.
     * @apiError   404/NotFound              Member not found.
     */
    static async patchMemberById(ctx) {
        if (ctx.state.auth.Role != 'admin') ctx.throw(403, 'Admin auth required'); // Forbidden

        ctx.request.body = await castBoolean.fromStrings('Member', ctx.request.body);

        await Member.update(ctx.params.id, ctx.request.body);

        // return updated member details
        ctx.response.body = await Member.get(ctx.params.id);
        if (!ctx.response.body) ctx.throw(404, `No member ${ctx.params.id} found`); // Not Found

        ctx.response.body.root = 'Member';
    }


    /**
     * @api {delete} /members/:id Delete member
     * @apiName      DeleteMembers
     * @apiGroup     Members
     *
     * @apiHeader  Authorization        Basic Access Authentication token.
     * @apiSuccess (Success 2xx) 200/OK Full details of deleted member.
     * @apiError   401/Unauthorized     Invalid JWT auth credentials supplied.
     * @apiError   403/Forbidden        Admin auth required.
     * @apiError   404/NotFound         Member not found.
     */
    static async deleteMemberById(ctx) {
        if (ctx.state.auth.Role != 'admin') ctx.throw(403, 'Admin auth required'); // Forbidden

        // return deleted member details
        const member = await Member.get(ctx.params.id);

        if (!member) ctx.throw(404, `No member ${ctx.params.id} found`); // Not Found

        await Member.delete(ctx.params.id);

        ctx.response.body = member; // deleted member details
        ctx.response.body.root = 'Member';
    }
}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default MembersHandlers;

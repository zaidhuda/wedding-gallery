"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
var cloudflare_workers_1 = require("cloudflare:workers");
var buffer_1 = require("buffer");
var ENVIRONMENT = cloudflare_workers_1.env.ENVIRONMENT;
var IS_DEVELOPMENT = ENVIRONMENT === 'development';
var PHOTO_BASE_URL = cloudflare_workers_1.env.PHOTO_BASE_URL;
var GUEST_PASSWORD = cloudflare_workers_1.env.GUEST_PASSWORD;
var MAX_PHOTO_SIZE = cloudflare_workers_1.env.MAX_PHOTO_SIZE;
var TEXT_SYSTEM_PROMPT = cloudflare_workers_1.env.TEXT_SYSTEM_PROMPT;
var IMAGE_SYSTEM_PROMPT = cloudflare_workers_1.env.IMAGE_SYSTEM_PROMPT;
// ===== HELPERS =====
var normalizeOrigin = function (value) {
    if (!value)
        return null;
    try {
        return new URL(value).origin;
    }
    catch (_a) {
        return null;
    }
};
var isAccessAuthenticated = function (request) {
    if (IS_DEVELOPMENT)
        return true;
    var jwt = request.headers.get('Cf-Access-Jwt-Assertion');
    var email = request.headers.get('Cf-Access-Authenticated-User-Email');
    return !!(jwt && email);
};
var getAccessEmail = function (request) {
    if (IS_DEVELOPMENT)
        return 'dev@localhost';
    return request.headers.get('Cf-Access-Authenticated-User-Email') || 'unknown';
};
var jsonResponse = function (data, status, corsHeaders) {
    if (status === void 0) { status = 200; }
    if (corsHeaders === void 0) { corsHeaders = {}; }
    return new Response(JSON.stringify(data), {
        status: status,
        headers: __assign(__assign({}, corsHeaders), { 'Content-Type': 'application/json' }),
    });
};
var errorResponse = function (message, status, corsHeaders, code) {
    if (status === void 0) { status = 400; }
    if (corsHeaders === void 0) { corsHeaders = {}; }
    var body = { error: message };
    if (code)
        body.code = code;
    return jsonResponse(body, status, corsHeaders);
};
var validateUserInput = function (name, message) {
    if (name && name.length > 50)
        return 'Name is too long (max 50 characters)';
    if (message && message.length > 500)
        return 'Message is too long (max 500 characters)';
    return null;
};
var mapToPhotoObject = function (p) { return ({
    id: p.id,
    objectKey: p.object_key,
    name: p.name,
    message: p.message,
    eventTag: p.event_tag,
    timestamp: p.timestamp,
    takenAt: p.taken_at,
    isApproved: p.is_approved,
    token: p.token,
    url: "".concat(PHOTO_BASE_URL, "/").concat(p.object_key),
}); };
var getEditWindowStatus = function (timestamp) {
    var uploadTime = new Date(timestamp).getTime();
    var now = Date.now();
    var oneHourInMs = 60 * 60 * 1000;
    return now - uploadTime <= oneHourInMs;
};
// ===== AI MODERATION =====
var extractJsonObject = function (text) {
    if (!text)
        return null;
    if (typeof text === 'object')
        return JSON.stringify(text);
    var raw = text.toString();
    var start = raw.indexOf('{');
    var end = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start)
        return null;
    var candidate = raw.slice(start, end + 1);
    return candidate;
};
var parseSafeUnsafeFallback = function (textRaw) {
    if (!textRaw)
        return null;
    var raw = textRaw.toString();
    var t = (raw || '').trim();
    if (!t)
        return null;
    var firstToken = t.split(/\s+/)[0].toUpperCase();
    if (firstToken === 'SAFE')
        return { result: 'safe', reason: 'ai_approved_fallback' };
    if (firstToken === 'UNSAFE')
        return { result: 'unsafe', reason: 'ai_flagged_fallback' };
    if (firstToken === 'UNSURE')
        return { result: 'unsure', reason: 'ai_unsure_fallback' };
    return null;
};
var parseAIModerationResponse = function (aiRaw, defaultReasonPrefix) {
    var _a;
    var parsed = null;
    if (typeof aiRaw === 'object' && aiRaw !== null) {
        // Some Cloudflare AI models return the message object or just the response text
        var extracted = aiRaw.response || aiRaw;
        if (typeof extracted === 'string') {
            var candidate = extractJsonObject(extracted);
            if (candidate) {
                try {
                    parsed = JSON.parse(candidate);
                }
                catch (e) { }
            }
        }
        else if (typeof extracted === 'object') {
            parsed = extracted;
        }
    }
    else {
        var raw = (aiRaw || '').toString();
        var candidate = extractJsonObject(raw);
        if (candidate) {
            try {
                parsed = JSON.parse(candidate);
            }
            catch (e) {
                console.error('Failed to parse AI JSON:', e);
            }
        }
    }
    if (parsed && typeof parsed === 'object') {
        if (parsed.result === 'safe' || parsed.safe === true) {
            return {
                status: 'safe',
                reason: parsed.reason || "".concat(defaultReasonPrefix, "_approved"),
            };
        }
        else if (parsed.result === 'unsafe' || parsed.safe === false) {
            return {
                status: 'unsafe',
                reason: parsed.reason || "".concat(defaultReasonPrefix, "_flagged"),
            };
        }
        else if (parsed.result === 'unsure') {
            return {
                status: 'unsure',
                reason: parsed.reason || "".concat(defaultReasonPrefix, "_unsure"),
            };
        }
    }
    var fallbackSource = typeof aiRaw === 'object' && aiRaw !== null
        ? ((_a = aiRaw.response) !== null && _a !== void 0 ? _a : '')
        : aiRaw || '';
    var fallback = parseSafeUnsafeFallback(fallbackSource);
    if (fallback) {
        return {
            status: fallback.result,
            reason: fallback.reason,
        };
    }
    return {
        status: 'unsure',
        reason: "".concat(defaultReasonPrefix, "_needs_review"),
    };
};
var moderateTextWithAI = function (name, message, env) { return __awaiter(void 0, void 0, void 0, function () {
    var hasUserText, safeName, safeMsg, textToAnalyze, payload, response, aiText, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                hasUserText = (name && name.trim() && name !== 'Anonymous') ||
                    (message && message.trim());
                if (!hasUserText) {
                    return [2 /*return*/, { status: 'safe', reason: 'no_text' }];
                }
                if (!env.AI) {
                    console.log('AI binding not available, requires manual review');
                    return [2 /*return*/, { status: 'unsure', reason: 'ai_unavailable' }];
                }
                safeName = (name || 'Anonymous').trim().slice(0, 50);
                safeMsg = (message || '').trim().slice(0, 500);
                textToAnalyze = "Guestbook entry:\n" +
                    "- DisplayName (metadata, not an insult target): ".concat(JSON.stringify(safeName), "\n") +
                    "- Message: ".concat(JSON.stringify(safeMsg));
                payload = {
                    messages: [
                        { role: 'system', content: TEXT_SYSTEM_PROMPT },
                        { role: 'user', content: textToAnalyze },
                    ],
                    temperature: 0,
                    top_p: 1,
                    max_tokens: 40,
                    stop: ['\n\n', '```'],
                };
                return [4 /*yield*/, env.AI.run('@cf/meta/llama-3.2-3b-instruct', payload)];
            case 1:
                response = _a.sent();
                aiText = (response && response.response) || '';
                console.log('AI text moderation raw:', aiText);
                return [2 /*return*/, parseAIModerationResponse(aiText, 'ai_text')];
            case 2:
                error_1 = _a.sent();
                console.error('AI text moderation error:', error_1);
                return [2 /*return*/, {
                        status: 'unsure',
                        reason: 'ai_error_review',
                    }];
            case 3: return [2 /*return*/];
        }
    });
}); };
var moderateImageWithAI = function (imageBlob, env) { return __awaiter(void 0, void 0, void 0, function () {
    var buf, b64, mime, dataUrl, response, aiRaw, error_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 3, , 4]);
                if (!env.AI) {
                    console.log('AI binding not available, requires manual review');
                    return [2 /*return*/, { status: 'unsure', reason: 'ai_unavailable' }];
                }
                return [4 /*yield*/, imageBlob.arrayBuffer()];
            case 1:
                buf = _a.sent();
                b64 = buffer_1.Buffer.from(buf).toString('base64');
                mime = imageBlob.type || 'image/jpeg';
                dataUrl = "data:".concat(mime, ";base64,").concat(b64);
                return [4 /*yield*/, env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
                        messages: [
                            { role: 'system', content: IMAGE_SYSTEM_PROMPT },
                            {
                                role: 'user',
                                content: [
                                    {
                                        type: 'text',
                                        text: 'Classify this image for guestbook safety.',
                                    },
                                    { type: 'image_url', image_url: { url: dataUrl } },
                                ],
                            },
                        ],
                        max_tokens: 60,
                        temperature: 0,
                        top_p: 1,
                    })];
            case 2:
                response = _a.sent();
                aiRaw = (response && response.response) || response;
                console.log('AI image moderation raw:', aiRaw);
                return [2 /*return*/, parseAIModerationResponse(aiRaw, 'ai_image')];
            case 3:
                error_2 = _a.sent();
                console.error('AI image moderation error:', error_2);
                return [2 /*return*/, {
                        status: 'unsure',
                        reason: 'ai_error_review',
                    }];
            case 4: return [2 /*return*/];
        }
    });
}); };
var processBackgroundModeration = function (photoId, imageBlob, env) { return __awaiter(void 0, void 0, void 0, function () {
    var imageResult, error_3;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 5, , 6]);
                return [4 /*yield*/, moderateImageWithAI(imageBlob, env)];
            case 1:
                imageResult = _a.sent();
                if (!(imageResult.status === 'safe')) return [3 /*break*/, 3];
                return [4 /*yield*/, env.DB.prepare('UPDATE photos SET is_approved = 1 WHERE id = ?')
                        .bind(photoId)
                        .run()];
            case 2:
                _a.sent();
                console.log("Photo ".concat(photoId, " auto-approved by AI."));
                return [3 /*break*/, 4];
            case 3:
                console.log("Photo ".concat(photoId, " moderation result: ").concat(imageResult.status, " (").concat(imageResult.reason, ")"));
                _a.label = 4;
            case 4: return [3 /*break*/, 6];
            case 5:
                error_3 = _a.sent();
                console.error("Background moderation failed for photo ".concat(photoId, ":"), error_3);
                return [3 /*break*/, 6];
            case 6: return [2 /*return*/];
        }
    });
}); };
// ===== HANDLERS =====
var handleUpload = function (request, env, ctx, corsHeaders) { return __awaiter(void 0, void 0, void 0, function () {
    var formData, uploadPassword, allowedTypes, validEventTags, image, name_1, message, eventTag, format, takenAtParam, validationError, extension, objectKey, imageArrayBuffer, imageBlob, textResult, isApproved, editToken, timestamp, takenAt, dbResult, photoId, photoObject, error_4;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, request.formData()];
            case 1:
                formData = _a.sent();
                uploadPassword = formData.get('pass');
                if (!uploadPassword ||
                    uploadPassword.toLowerCase() !== GUEST_PASSWORD.toLowerCase()) {
                    return [2 /*return*/, errorResponse('Invalid or missing password', 401, corsHeaders)];
                }
                _a.label = 2;
            case 2:
                _a.trys.push([2, 7, , 8]);
                allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
                validEventTags = ['Ijab & Qabul', 'Sanding', 'Tandang'];
                image = formData.get('image');
                name_1 = (formData.get('name') || '').trim() || 'Anonymous';
                message = (formData.get('message') || '').trim();
                eventTag = formData.get('eventTag');
                format = formData.get('format') || 'image/jpeg';
                takenAtParam = formData.get('takenAt');
                validationError = validateUserInput(name_1, message);
                if (validationError)
                    return [2 /*return*/, errorResponse(validationError, 400, corsHeaders)];
                if (!image || !eventTag) {
                    return [2 /*return*/, errorResponse('Missing required fields: image and eventTag', 400, corsHeaders)];
                }
                if (!allowedTypes.includes(format) ||
                    (image.type && !allowedTypes.includes(image.type))) {
                    return [2 /*return*/, errorResponse('Invalid file type. Only JPG, PNG, and WebP are allowed.', 400, corsHeaders)];
                }
                if (image.size > MAX_PHOTO_SIZE * 1024 * 1024) {
                    return [2 /*return*/, errorResponse("Photo is too large (max ".concat(MAX_PHOTO_SIZE, "MB)."), 400, corsHeaders)];
                }
                if (!validEventTags.includes(eventTag)) {
                    return [2 /*return*/, errorResponse('Invalid eventTag', 400, corsHeaders)];
                }
                extension = format === 'image/webp' ? '.webp' : '.jpg';
                objectKey = "photos/".concat(crypto.randomUUID()).concat(extension);
                return [4 /*yield*/, image.arrayBuffer()];
            case 3:
                imageArrayBuffer = _a.sent();
                imageBlob = new Blob([imageArrayBuffer], { type: format });
                return [4 /*yield*/, moderateTextWithAI(name_1, message, env)];
            case 4:
                textResult = _a.sent();
                if (textResult.status !== 'safe') {
                    return [2 /*return*/, errorResponse("This message can't be posted as it is. Please revise and try again.", 400, corsHeaders, 'TEXT_MODERATION_FAILED')];
                }
                isApproved = 0;
                editToken = crypto.randomUUID();
                timestamp = new Date().toISOString();
                takenAt = takenAtParam || timestamp;
                return [4 /*yield*/, env.PHOTOS_BUCKET.put(objectKey, imageArrayBuffer, {
                        httpMetadata: { contentType: format },
                    })];
            case 5:
                _a.sent();
                return [4 /*yield*/, env.DB.prepare('INSERT INTO photos (object_key, name, message, event_tag, timestamp, taken_at, is_approved, token) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
                        .bind(objectKey, name_1, message, eventTag, timestamp, takenAt, isApproved, editToken)
                        .run()];
            case 6:
                dbResult = _a.sent();
                photoId = dbResult.meta.last_row_id;
                // Background image moderation
                ctx.waitUntil(processBackgroundModeration(photoId, imageBlob, env));
                photoObject = {
                    id: photoId,
                    objectKey: objectKey,
                    name: name_1,
                    message: message,
                    eventTag: eventTag,
                    timestamp: timestamp,
                    takenAt: takenAt,
                    isApproved: isApproved,
                    token: editToken,
                    url: "".concat(PHOTO_BASE_URL, "/").concat(objectKey),
                };
                return [2 /*return*/, jsonResponse({ photo: photoObject }, 200, corsHeaders)];
            case 7:
                error_4 = _a.sent();
                console.error('Upload error:', error_4);
                return [2 /*return*/, errorResponse('Upload failed', 500, corsHeaders)];
            case 8: return [2 /*return*/];
        }
    });
}); };
var handleEdit = function (request, env, corsHeaders) { return __awaiter(void 0, void 0, void 0, function () {
    var body, id, token, name_2, message, validationError, photo, textModeration, error_5;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 5, , 6]);
                return [4 /*yield*/, request.json()];
            case 1:
                body = _a.sent();
                id = body.id, token = body.token;
                name_2 = (body.name || '').trim() || 'Anonymous';
                message = (body.message || '').trim();
                if (!id || !token)
                    return [2 /*return*/, errorResponse('Missing required fields: id, token', 400, corsHeaders)];
                validationError = validateUserInput(name_2, message);
                if (validationError)
                    return [2 /*return*/, errorResponse(validationError, 400, corsHeaders)];
                return [4 /*yield*/, env.DB.prepare('SELECT id, timestamp FROM photos WHERE id = ? AND token = ?')
                        .bind(id, token)
                        .first()];
            case 2:
                photo = _a.sent();
                if (!photo)
                    return [2 /*return*/, errorResponse('Invalid token or photo not found', 403, corsHeaders)];
                if (!getEditWindowStatus(photo.timestamp)) {
                    return [2 /*return*/, errorResponse('Edit window expired. Photos can only be edited within 1 hour of upload.', 403, corsHeaders)];
                }
                return [4 /*yield*/, moderateTextWithAI(name_2, message, env)];
            case 3:
                textModeration = _a.sent();
                if (textModeration.status !== 'safe') {
                    return [2 /*return*/, errorResponse("This message can't be posted as it is. Please revise and try again.", 400, corsHeaders, 'TEXT_MODERATION_FAILED')];
                }
                return [4 /*yield*/, env.DB.prepare('UPDATE photos SET name = ?, message = ? WHERE id = ?')
                        .bind(name_2, message, id)
                        .run()];
            case 4:
                _a.sent();
                return [2 /*return*/, jsonResponse({ success: true }, 200, corsHeaders)];
            case 5:
                error_5 = _a.sent();
                console.error('Edit error:', error_5);
                return [2 /*return*/, errorResponse('Edit failed', 500, corsHeaders)];
            case 6: return [2 /*return*/];
        }
    });
}); };
var handleDelete = function (request, env, corsHeaders) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, id, token, photo, e_1, error_6;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 8, , 9]);
                return [4 /*yield*/, request.json()];
            case 1:
                _a = _b.sent(), id = _a.id, token = _a.token;
                if (!id || !token)
                    return [2 /*return*/, errorResponse('Missing required fields: id, token', 400, corsHeaders)];
                return [4 /*yield*/, env.DB.prepare('SELECT id, object_key, timestamp FROM photos WHERE id = ? AND token = ?')
                        .bind(id, token)
                        .first()];
            case 2:
                photo = _b.sent();
                if (!photo)
                    return [2 /*return*/, errorResponse('Invalid token or photo not found', 403, corsHeaders)];
                if (!getEditWindowStatus(photo.timestamp)) {
                    return [2 /*return*/, errorResponse('Delete window expired. Photos can only be deleted within 1 hour of upload.', 403, corsHeaders)];
                }
                if (!photo.object_key) return [3 /*break*/, 6];
                _b.label = 3;
            case 3:
                _b.trys.push([3, 5, , 6]);
                return [4 /*yield*/, env.PHOTOS_BUCKET.delete(photo.object_key)];
            case 4:
                _b.sent();
                return [3 /*break*/, 6];
            case 5:
                e_1 = _b.sent();
                console.error('R2 delete error:', e_1);
                return [3 /*break*/, 6];
            case 6: return [4 /*yield*/, env.DB.prepare('DELETE FROM photos WHERE id = ?').bind(id).run()];
            case 7:
                _b.sent();
                return [2 /*return*/, jsonResponse({ success: true }, 200, corsHeaders)];
            case 8:
                error_6 = _b.sent();
                console.error('Delete error:', error_6);
                return [2 /*return*/, errorResponse('Delete failed', 500, corsHeaders)];
            case 9: return [2 /*return*/];
        }
    });
}); };
var handleGetPhotos = function (url, env, corsHeaders) { return __awaiter(void 0, void 0, void 0, function () {
    var eventTag, limit, offset, sinceId, checkIds, query, countQuery, params, checkedPhotos, ids, placeholders, checkQuery, checkResult, result, photos, allPhotos_1, hasMore, countResult, _a, error_7;
    var _b, _c;
    var _d, _e, _f;
    return __generator(this, function (_g) {
        switch (_g.label) {
            case 0:
                _g.trys.push([0, 9, , 10]);
                eventTag = url.searchParams.get('eventTag');
                limit = parseInt((_d = url.searchParams.get('limit')) !== null && _d !== void 0 ? _d : '') || 12;
                offset = parseInt((_e = url.searchParams.get('offset')) !== null && _e !== void 0 ? _e : '') || 0;
                sinceId = parseInt((_f = url.searchParams.get('since_id')) !== null && _f !== void 0 ? _f : '');
                checkIds = url.searchParams.get('check_ids');
                query = undefined, countQuery = undefined, params = undefined;
                checkedPhotos = [];
                if (!checkIds) return [3 /*break*/, 2];
                ids = checkIds
                    .split(',')
                    .map(function (id) { return parseInt(id); })
                    .filter(function (id) { return !isNaN(id); });
                if (!(ids.length > 0)) return [3 /*break*/, 2];
                placeholders = ids.map(function () { return '?'; }).join(',');
                checkQuery = "SELECT * FROM photos WHERE id IN (".concat(placeholders, ")");
                return [4 /*yield*/, (_b = env.DB.prepare(checkQuery))
                        .bind.apply(_b, ids).all()];
            case 1:
                checkResult = _g.sent();
                checkedPhotos = (checkResult.results || []).map(mapToPhotoObject);
                _g.label = 2;
            case 2:
                if (sinceId) {
                    query = eventTag
                        ? 'SELECT * FROM photos WHERE is_approved = 1 AND event_tag = ? AND id > ? ORDER BY id DESC LIMIT 50'
                        : 'SELECT * FROM photos WHERE is_approved = 1 AND id > ? ORDER BY id DESC LIMIT 50';
                    params = eventTag ? [eventTag, sinceId] : [sinceId];
                }
                else {
                    if (eventTag) {
                        query =
                            'SELECT * FROM photos WHERE is_approved = 1 AND event_tag = ? ORDER BY COALESCE(taken_at, timestamp) DESC LIMIT ? OFFSET ?';
                        countQuery =
                            'SELECT COUNT(*) as total FROM photos WHERE is_approved = 1 AND event_tag = ?';
                        params = [eventTag, limit + 1, offset];
                    }
                    else {
                        query =
                            'SELECT * FROM photos WHERE is_approved = 1 ORDER BY COALESCE(taken_at, timestamp) DESC LIMIT ? OFFSET ?';
                        countQuery =
                            'SELECT COUNT(*) as total FROM photos WHERE is_approved = 1';
                        params = [limit + 1, offset];
                    }
                }
                return [4 /*yield*/, (_c = env.DB.prepare(query))
                        .bind.apply(_c, params).all()];
            case 3:
                result = _g.sent();
                photos = (result.results || []).map(mapToPhotoObject);
                allPhotos_1 = __spreadArray([], checkedPhotos, true);
                photos.forEach(function (p) {
                    if (!allPhotos_1.find(function (cp) { return cp.id === p.id; })) {
                        allPhotos_1.push(p);
                    }
                });
                hasMore = photos.length > limit;
                if (hasMore)
                    allPhotos_1.pop();
                countResult = { total: 0 };
                if (!(!sinceId && countQuery)) return [3 /*break*/, 8];
                if (!eventTag) return [3 /*break*/, 5];
                return [4 /*yield*/, env.DB.prepare(countQuery).bind(eventTag).first()];
            case 4:
                _a = _g.sent();
                return [3 /*break*/, 7];
            case 5: return [4 /*yield*/, env.DB.prepare(countQuery).first()];
            case 6:
                _a = _g.sent();
                _g.label = 7;
            case 7:
                countResult = (_a);
                _g.label = 8;
            case 8: return [2 /*return*/, jsonResponse({
                    photos: allPhotos_1,
                    hasMore: hasMore,
                    total: (countResult === null || countResult === void 0 ? void 0 : countResult.total) || 0,
                    limit: limit,
                    offset: offset,
                }, 200, corsHeaders)];
            case 9:
                error_7 = _g.sent();
                console.error('Fetch photos error:', error_7);
                return [2 /*return*/, errorResponse('Failed to fetch photos', 500, corsHeaders)];
            case 10: return [2 /*return*/];
        }
    });
}); };
var handleAdminPending = function (request, env, corsHeaders) { return __awaiter(void 0, void 0, void 0, function () {
    var adminEmail, result, photos, error_8;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                if (!isAccessAuthenticated(request))
                    return [2 /*return*/, errorResponse('Unauthorized', 401, corsHeaders)];
                adminEmail = getAccessEmail(request);
                return [4 /*yield*/, env.DB.prepare('SELECT * FROM photos WHERE is_approved = 0 ORDER BY timestamp DESC').all()];
            case 1:
                result = _a.sent();
                photos = (result.results || []).map(mapToPhotoObject);
                return [2 /*return*/, jsonResponse({ photos: photos, admin: adminEmail }, 200, corsHeaders)];
            case 2:
                error_8 = _a.sent();
                console.error('Fetch pending error:', error_8);
                return [2 /*return*/, errorResponse('Failed to fetch pending photos', 500, corsHeaders)];
            case 3: return [2 /*return*/];
        }
    });
}); };
var handleAdminAction = function (request, env, corsHeaders) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, imageID, action, ids, targetIds, placeholders, photosRes, _i, _b, photo, e_2, error_9;
    var _c, _d, _e;
    return __generator(this, function (_f) {
        switch (_f.label) {
            case 0:
                _f.trys.push([0, 13, , 14]);
                if (!isAccessAuthenticated(request))
                    return [2 /*return*/, errorResponse('Unauthorized', 401, corsHeaders)];
                return [4 /*yield*/, request.json()];
            case 1:
                _a = _f.sent(), imageID = _a.imageID, action = _a.action, ids = _a.ids;
                targetIds = ids || (imageID ? [imageID] : []);
                if (targetIds.length === 0)
                    return [2 /*return*/, errorResponse('Missing imageID or ids', 400, corsHeaders)];
                placeholders = targetIds.map(function () { return '?'; }).join(',');
                if (!(action === 'approve')) return [3 /*break*/, 3];
                return [4 /*yield*/, (_c = env.DB.prepare("UPDATE photos SET is_approved = 1 WHERE id IN (".concat(placeholders, ")")))
                        .bind.apply(_c, targetIds).run()];
            case 2:
                _f.sent();
                return [2 /*return*/, jsonResponse({ action: 'approved', count: targetIds.length }, 200, corsHeaders)];
            case 3:
                if (!(action === 'delete')) return [3 /*break*/, 12];
                return [4 /*yield*/, (_d = env.DB.prepare("SELECT id, object_key FROM photos WHERE id IN (".concat(placeholders, ")")))
                        .bind.apply(_d, targetIds).all()];
            case 4:
                photosRes = _f.sent();
                _i = 0, _b = photosRes.results || [];
                _f.label = 5;
            case 5:
                if (!(_i < _b.length)) return [3 /*break*/, 10];
                photo = _b[_i];
                if (!photo.object_key) return [3 /*break*/, 9];
                _f.label = 6;
            case 6:
                _f.trys.push([6, 8, , 9]);
                return [4 /*yield*/, env.PHOTOS_BUCKET.delete(photo.object_key)];
            case 7:
                _f.sent();
                return [3 /*break*/, 9];
            case 8:
                e_2 = _f.sent();
                console.error('R2 delete error:', e_2);
                return [3 /*break*/, 9];
            case 9:
                _i++;
                return [3 /*break*/, 5];
            case 10: return [4 /*yield*/, (_e = env.DB.prepare("DELETE FROM photos WHERE id IN (".concat(placeholders, ")")))
                    .bind.apply(_e, targetIds).run()];
            case 11:
                _f.sent();
                return [2 /*return*/, jsonResponse({ action: 'deleted', count: targetIds.length }, 200, corsHeaders)];
            case 12: return [2 /*return*/, errorResponse('Invalid action. Use "approve" or "delete"', 400, corsHeaders)];
            case 13:
                error_9 = _f.sent();
                console.error('Admin action error:', error_9);
                return [2 /*return*/, errorResponse('Action failed', 500, corsHeaders)];
            case 14: return [2 /*return*/];
        }
    });
}); };
var handleAdminUnapprove = function (request, env, corsHeaders) { return __awaiter(void 0, void 0, void 0, function () {
    var id, error_10;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 3, , 4]);
                if (!isAccessAuthenticated(request))
                    return [2 /*return*/, errorResponse('Unauthorized', 401, corsHeaders)];
                return [4 /*yield*/, request.json()];
            case 1:
                id = (_a.sent()).id;
                if (!id)
                    return [2 /*return*/, errorResponse('Missing photo id', 400, corsHeaders)];
                return [4 /*yield*/, env.DB.prepare('UPDATE photos SET is_approved = 0 WHERE id = ?')
                        .bind(id)
                        .run()];
            case 2:
                _a.sent();
                return [2 /*return*/, jsonResponse({ action: 'unapproved', id: id }, 200, corsHeaders)];
            case 3:
                error_10 = _a.sent();
                console.error('Unapprove error:', error_10);
                return [2 /*return*/, errorResponse('Unapprove failed', 500, corsHeaders)];
            case 4: return [2 /*return*/];
        }
    });
}); };
var handleAdminVerify = function (request, corsHeaders) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        if (!isAccessAuthenticated(request))
            return [2 /*return*/, jsonResponse({ authenticated: false }, 401, corsHeaders)];
        return [2 /*return*/, jsonResponse({ authenticated: true, email: getAccessEmail(request) }, 200, corsHeaders)];
    });
}); };
var handleServeImage = function (path, env, corsHeaders) { return __awaiter(void 0, void 0, void 0, function () {
    var objectKey, object, headers, error_11;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                objectKey = path.replace('/api/images/', '');
                return [4 /*yield*/, env.PHOTOS_BUCKET.get(objectKey)];
            case 1:
                object = _a.sent();
                console.log(objectKey, object);
                if (!object)
                    return [2 /*return*/, new Response('Not Found', { status: 404, headers: corsHeaders })];
                headers = new Headers(corsHeaders);
                object.writeHttpMetadata(headers);
                headers.set('etag', object.httpEtag);
                headers.set('Cache-Control', 'public, max-age=31536000, immutable');
                return [2 /*return*/, new Response(object.body, { headers: headers })];
            case 2:
                error_11 = _a.sent();
                console.error('Image serve error:', error_11);
                return [2 /*return*/, new Response('Error serving image', {
                        status: 500,
                        headers: corsHeaders,
                    })];
            case 3: return [2 /*return*/];
        }
    });
}); };
exports.default = {
    fetch: function (request, env, ctx) {
        return __awaiter(this, void 0, void 0, function () {
            var url, path, method, selfOrigin, origin, secFetchSite, requestOrigin, isSameOriginByOrigin, isSameOriginByFetchMeta, corsHeaders;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = new URL(request.url);
                        path = url.pathname;
                        method = request.method;
                        selfOrigin = url.origin;
                        origin = request.headers.get('Origin');
                        secFetchSite = request.headers.get('Sec-Fetch-Site');
                        requestOrigin = normalizeOrigin(origin);
                        isSameOriginByOrigin = requestOrigin && requestOrigin === selfOrigin;
                        isSameOriginByFetchMeta = secFetchSite === 'same-origin';
                        if (!isSameOriginByOrigin && !isSameOriginByFetchMeta && !IS_DEVELOPMENT) {
                            return [2 /*return*/, new Response(JSON.stringify({ error: 'Forbidden' }), {
                                    status: 403,
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Access-Control-Allow-Origin': 'null',
                                    },
                                })];
                        }
                        corsHeaders = {
                            'Access-Control-Allow-Origin': requestOrigin || selfOrigin,
                            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                            'Access-Control-Allow-Headers': 'Content-Type',
                            'Access-Control-Allow-Credentials': 'true',
                        };
                        if (method === 'OPTIONS') {
                            return [2 /*return*/, new Response(null, { headers: corsHeaders })];
                        }
                        if (!IS_DEVELOPMENT) return [3 /*break*/, 2];
                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 1000); })];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        // Routing
                        if (path === '/api/upload' && method === 'POST')
                            return [2 /*return*/, handleUpload(request, env, ctx, corsHeaders)];
                        if (path === '/api/edit' && method === 'POST')
                            return [2 /*return*/, handleEdit(request, env, corsHeaders)];
                        if (path === '/api/delete' && method === 'POST')
                            return [2 /*return*/, handleDelete(request, env, corsHeaders)];
                        if (path === '/api/photos' && method === 'GET')
                            return [2 /*return*/, handleGetPhotos(url, env, corsHeaders)];
                        // Admin routes
                        if (path === '/api/admin/pending' && method === 'GET')
                            return [2 /*return*/, handleAdminPending(request, env, corsHeaders)];
                        if (path === '/api/admin/action' && method === 'POST')
                            return [2 /*return*/, handleAdminAction(request, env, corsHeaders)];
                        if (path === '/api/admin/verify' && method === 'GET')
                            return [2 /*return*/, handleAdminVerify(request, corsHeaders)];
                        if (path === '/api/admin/unapprove' && method === 'POST')
                            return [2 /*return*/, handleAdminUnapprove(request, env, corsHeaders)];
                        // Dev only: Serve images from R2
                        if (IS_DEVELOPMENT && path.startsWith('/api/images/'))
                            return [2 /*return*/, handleServeImage(path, env, corsHeaders)];
                        return [2 /*return*/, new Response('Not Found', { status: 404, headers: corsHeaders })];
                }
            });
        });
    },
};

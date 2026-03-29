/**
 * Utility functions shared across the application.
 */

const sleep = ms => new Promise(res => setTimeout(res, ms));

const randMinMax = (min, max) => Math.random() * (max - min) + min;

/** 
 * Build URL query string from array of [key, value] pairs.
 * Filters out undefined values.
 * From https://github.com/victornpb/undiscord/blob/master/src/undiscord-core.js
 */
const queryString = params => params
    .filter(p => p[1] !== undefined)
    .map(p => p[0] + '=' + encodeURIComponent(p[1]))
    .join('&');

module.exports = { sleep, randMinMax, queryString };

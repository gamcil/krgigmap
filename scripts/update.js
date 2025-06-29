/**
 * Main script for fetching events and matching them to venues.
 *
 * Generates:
 *
 *   ../public/data.json
 *       GeoJSON file used for display in Maplibre. Each venue
 *       is one Feature in the FeatureCollection. Events are populated
 *       in the feature.properties.events property.
 *
 *   ../public/unmatched.json
 *       Events that could not be matched to venues.
 */

const { fetchShowdeeEvents } = require('./showdee.js');
const { fetchRAEvents } = require('./ra.js');
const { matchEventsToVenues } = require('./venuematcher.js');
const fs = require('fs');

function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

async function main() {
    const startDate = new Date();
    const endDate = addDays(startDate, 365);

    const showdeeEvents = await fetchShowdeeEvents(startDate);
    const raEvents = await fetchRAEvents(startDate, endDate);
    const events = [...showdeeEvents, ...raEvents];
    const { geojson, unmatched } = await matchEventsToVenues(events);

    fs.writeFileSync('../public/geojson.json', JSON.stringify(geojson, null, 2))
    fs.writeFileSync('../public/unmatched.json', JSON.stringify(unmatched, null, 2))
}

main();
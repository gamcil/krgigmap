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

function formatDateToYMD(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

async function main() {
    const startDate = new Date();
    const endDate = addDays(startDate, 365);
    const startDateStr = formatDateToYMD(startDate);
    const endDateStr = formatDateToYMD(endDate);
    
    console.log(`Fetching events from ${startDateStr} to ${endDateStr}`);
    console.log("Fetching Showdee events");
    const showdeeEvents = await fetchShowdeeEvents(startDateStr);

    console.log("Fetching RA events");
    const raEvents = await fetchRAEvents(startDateStr, endDateStr);

    console.log("Matching events to venues");
    const events = [...showdeeEvents, ...raEvents];
    const { geojson, unmatched } = await matchEventsToVenues(events);
    const meta = {
        updateDate: startDateStr,  // startDate.toISOString() for time as well
        eventCount: events.length,
        unmatchedCount: unmatched.length,
    }
    console.log(`Matched ${events.length - unmatched.length}/${events.length} events to venues`);
    fs.writeFileSync('../public/data.json', JSON.stringify(geojson, null, 2))
    fs.writeFileSync('../public/unmatched.json', JSON.stringify(unmatched, null, 2))
    fs.writeFileSync('../public/metadata.json', JSON.stringify(meta, null, 2))
}

main();
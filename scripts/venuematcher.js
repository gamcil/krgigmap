const fs = require('fs');
const path = require('path');
const Fuse = require('fuse.js');
const hangul = require('es-hangul');


const EN_TO_HANGUL = {
    A: '에이', B: '비', C: '씨', D: '디', E: '이',
    F: '에프', G: '지', H: '에이치', I: '아이', J: '제이',
    K: '케이', L: '엘', M: '엠', N: '엔', O: '오',
    P: '피', Q: '큐', R: '알', S: '에스', T: '티',
    U: '유', V: '브이', W: '더블유', X: '엑스', Y: '와이', Z: '지'
};

// Digits -> hangul (e.g. 001클럽 to 영영일클럽)
// Latin characters -> hangul (e.g. AP스튜디오 to 에이피스튜디오)
// Normalize, remove diacritics, whitespace, special characters
function normalize(text) {
    if (!text) return ''
    const changeAlphanumeric = (c) => {
        let C = c.toUpperCase()
        return (c >= '0' && c <= '9')
            ? hangul.numberToHangul(parseInt(c))
            : (EN_TO_HANGUL[C] ? EN_TO_HANGUL[C] : c);
    }
    return text.split('')
        .map(changeAlphanumeric)
        .join('')
        .replace(/[^가-힣a-zA-Z0-9\s]/g, '')
        .normalize("NFKD")  // decomposes hangul to jamo
        .toLowerCase()
        .replace(/([\u0041-\u007A])[\u0300-\u036f]+/g, '$1')  // latin diacritics
        .replace(/\s+/g, '')  // whitespace
        .normalize("NFC")   // recompose here for hangul.disassemble
}

function getVenueList() {
    return JSON.parse(fs.readFileSync(path.resolve(__dirname, 'venues.json')));
}

function buildFuseIndex(venues) {
    return new Fuse(
        venues.map((v, i) => ({
            id: i,
            key: `${i}_${v.name_ko}_${v.name}`,
            name_en: v.name?.toLowerCase().normalize().replace(/ /g, ''),
            name: normalize(v.name_ko),
            address: normalize(v.address_ko),
            aliases: v.alias?.map(a => normalize(a)) || [],
            nameJamo: hangul.disassemble(normalize(v.name_ko)),
            addressJamo: hangul.disassemble(normalize(v.address_ko)),
            aliasesJamo: (v.aliases || []).map(a => hangul.disassemble(normalize(a))),
        })), {
        keys: [
            { name: 'name', weight: 0.7 },
            { name: 'name_en', weight: 0.7 },
            { name: 'address', weight: 0.3 },
            { name: 'aliases', weight: 0.1 },
            { name: 'nameJamo', weight: 0.2 },
            { name: 'addressJamo', weight: 0.03 },
            { name: 'aliasesJamo', weight: 0.02 }
        ],
        tokenize: false,
        threshold: 0.4,
        ignoreLocation: true,
        shouldSort: true,
        distance: 100
    });
}

function buildRAVenueMap(venues) {
    const venueRAMap = {};
    venues.forEach((v, i) => {
        if (v.ra_id) venueRAMap[v.ra_id] = v;
        v.id = i;
    })
    return venueRAMap;
}

function isLikelyKoreanAddress(text = '') {
    return /^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[시도]?\s?.*?[구군]\s?.+/.test(text);
}

function containsCityAreaName(text = '') {
    return text.match(/^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|이태원|홍대|삼각지|문래|성수|거제)[동]? /);
}

function convertVenuesToGeoJSON(venues) {
    return {
        type: "FeatureCollection",
        features: venues.map(venue => ({
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [venue.lng, venue.lat]
            },
            properties: {
                name_ko: venue.name_ko,
                name: venue.name,
                address_ko: venue.address_ko,
                address: venue.address,
                address_jibun: venue.address_jibun,
                website: venue.website,
                instagram: venue.instagram,
                kakaoMaps: venue.kakaoMaps,
                googleMaps: venue.googleMaps,
                naverMaps: venue.naverMaps,
                ra_id: venue.ra_id,
                events: [] // ← you'll attach matched events here later
            }
        }))
    };
}

async function matchEventsToVenues(events) {
    const venues = getVenueList();
    const fuseIndex = buildFuseIndex(venues);
    const venueRAMap = buildRAVenueMap(venues);
    const venues_geoJSON = convertVenuesToGeoJSON(venues)
    const unmatched = [];

    let count = 0;
    events.forEach(event => {
        if (event.ra_id) {
            const match = venueRAMap[parseInt(event.ra_id)]
            if (match) {
                venues_geoJSON.features[match.id].properties.events.push(event)
                count++;
            } else {
                unmatched.push(event);
            }
            return;
        }
        let result;
        let location = event.location;
        if (event.source === 'showdee') {
            location = event.location.replace(/[Cc]lub/, '클럽');
            const result2 = containsCityAreaName(location)
            const city = result2?.[0].replace(/ /g, '') || '';
            const fixed = location.replace(city, '')
            const query_full = normalize(fixed);
            const addr_full = normalize(city)
            const query_jamo = hangul.disassemble(query_full)
            const addr_jamo = hangul.disassemble(addr_full)
            const query_combined = {
                name: query_full,
                address: addr_full,
                aliases: [query_full],
                nameJamo: query_jamo,
                addressJamo: addr_jamo,
                aliasesJamo: [query_jamo]
            }
            result = fuseIndex.search(query_combined.name, { limit: 1, useExtendedSearch: true });
            if (result.length === 0) {
                const likely = isLikelyKoreanAddress(location)
                    ? 'address'
                    : (location.includes('인근') || location.includes('일대'))
                        ? 'areaEvent'
                        : 'unknown'
                unmatched.push({ ...event, unmatchedReason: likely });
            } else {
                venues_geoJSON.features[result[0].item.id].properties.events.push(event);
                count++;
            }
        } else if (event.source === 'ra') {
            // Probably won't catch as much here
            location = location.toLowerCase().normalize().replace(/ /g, '')
            result = fuseIndex.search({ name_en: location }, { limit: 1, useExtendedSearch: true });
            if (result.length > 0) {
                venues_geoJSON.features[result[0].item.id].properties.events.push(event);
                count++;
            } else {
                unmatched.push({ ...event, unmatchedReason: 'unknown' });
            }
        }
    });
    return {
        geojson: venues_geoJSON,
        unmatched: unmatched
    }
}

module.exports = { matchEventsToVenues };
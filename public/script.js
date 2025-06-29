/**
 * Create and add variants of the default Maplibre marker to use in symbol layers
 * taken from https://github.com/bogind/maplibre_addMarkerImage
 */
maplibregl.Map.prototype.addMarkerImage = function (id, options = {}, callback) {
    try {
        let marker = new maplibregl.Marker(options);
        let svgDoc;
        if (!options || !options.element) {
            svgDoc = marker._element.firstChild;// default marker
        } else {
            svgDoc = marker._element; // for SVG elements
        }
        let markerSVG = new XMLSerializer().serializeToString(svgDoc);
        let markerImg = new Image(svgDoc.width.baseVal.value, svgDoc.height.baseVal.value);
        markerImg.src = 'data:image/svg+xml;base64,' + window.btoa(markerSVG);
        markerImg.decode()
            .then(() => {
                if (!this.hasImage(id)) this.addImage(id, markerImg);
                if (callback) {
                    callback()
                }
            })
            .catch((encodingError) => {
                console.error("Image Encoding Error")
                console.error(encodingError)
            });

    } catch (error) {
        console.error(error)
    }
}

async function getData() {
    try {
        const response = await fetch('./testdata.json');
        const json = await response.json();
        return json;
    } catch (error) {
        console.error(error.message);
    }
}

/**
 * Mutates GeoJSON to set active/inactive venues by date
 * @param {Object} geojson GeoJSON data object
 * @param {Date} selectedDate Currently selected date to filter for
 */
function updateActiveVenuesByDate(geojson, selectedDate) {
    const dateStr = selectedDate instanceof Date ? formatDateToYMD(selectedDate) : selectedDate
    for (const feature of geojson.features) {
        const props = feature.properties;
        props.active = false;
        props.events.forEach(event => {
            event.date = formatDateToYMD(new Date(event.date));
            if (!props.active && event.date === dateStr) {
                props.active = true;
                props.source = event.source;
            }
        })
    }
}

/**
 * Format Date to YYYY-MM-DD string
 * @param {Date} date Date to format
 * @returns YYYY-MM-DD format string
 */
function formatDateToYMD(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/**
 * Format Date to HH:MM:SS time string
 * @param {Date} date Date to format
 * @returns HH:MM:SS format string
 */
function formatTime(date) {
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
}

async function loadMap() {
    const geojsonRaw = await fetch("./data.json");
    let geojson = await geojsonRaw.json();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let displayDate = today;

    // For initial load, set venues with events today as active
    updateActiveVenuesByDate(geojson, today)

    // Count events for calendar badges
    let eventCounts = geojson?.features?.flatMap(f => f.properties?.events || [])
        .reduce((acc, event) => {
            if (!event?.date) return acc;
            acc[event.date] = (acc[event.date] || 0) + 1;
            return acc
        }, {})
    let totalDates = Object.keys(eventCounts).length;
    let totalEvents = Object.values(eventCounts).reduce((acc, count) => acc + count, 0);
    let totalVenuesWithEvents = geojson.features.filter(feature => feature.properties.events?.length > 0).length;
    let maximumDate = Object.keys(eventCounts)
        .reduce((max, curr) => new Date(curr) > new Date(max) ? new Date(curr) : new Date(max), new Date());
    // maximumDate.setHours(23, 59, 99, 999);
    maximumDate.setDate(maximumDate.getDate() + 1);
    document.getElementById("event-info-date-count").textContent = totalDates;
    document.getElementById("event-info-event-count").textContent = totalEvents;
    document.getElementById("event-info-venue-count").textContent = totalVenuesWithEvents;
    document.getElementById("event-info-end-date").textContent = maximumDate.toISOString().slice(0, 10);


    const map = new maplibregl.Map({
        style: 'https://tiles.openfreemap.org/styles/dark',
        // style: 'https://tiles.openfreemap.org/styles/liberty',
        center: [126.9784, 37.5666],
        maxBounds: [
            [123.7597, 32.5947], // southwest corner (lng, lat)
            [132.0888, 39.649]  // northeast corner (lng, lat)
        ],
        zoom: 11,
        container: 'map',
    });
    
    document.getElementById('event-info-toggle').addEventListener('click', () => {
        document.getElementById('event-info').classList.toggle('active');
    });

    const fp = flatpickr(document.querySelector("#event-calendar"), {
        inline: true,
        mode: 'single',
        defaultDate: today,
        enableTime: false,
        minDate: today,
        maxDate: maximumDate,
        disableMobile: false,
        disable: [
            function (date) {
                return !(formatDateToYMD(date) in eventCounts);
            }
        ],
        onDayCreate: function (dObj, dStr, fp, dayElem) {
            if (dayElem.dateObj < today) return;
            const date = formatDateToYMD(dayElem.dateObj);
            const count = eventCounts[date];
            if (count > 0) {
                const badge = document.createElement("span")
                badge.className = "event-count"
                badge.textContent = count;
                dayElem.appendChild(badge)
            }
        },
        onChange: function (selectedDate, dateStr, instance) {
            displayDate = selectedDate[0];
            const date = formatDateToYMD(selectedDate[0]);
            updateActiveVenuesByDate(geojson, date);
            const source = map.getSource('places');
            if (source) {
                source.setData(geojson)
            }
        }
    });
    
    map.on('load', () => {
        map.addMarkerImage('marker2')
        map.addMarkerImage('marker3', { color: 'red' })

        map.addSource('places', {
            type: 'geojson',
            data: geojson
        });

        map.addLayer({
            id: 'places-inactive',
            type: 'circle',
            source: 'places',
            filter: ['==', 'active', false],
            paint: {
                'circle-radius': 5,
                'circle-color': '#bbb',
                'circle-opacity': 1.0,
                'circle-stroke-width': 2,
                'circle-stroke-color': '#aaa',
            }
        });

        map.addLayer({
            id: 'places-active',
            type: 'symbol',
            source: 'places',
            // filter: ['==', 'active', true],
            filter: ['all', ['==', 'active', true], ['==', 'source', 'showdee']],
            layout: {
                'icon-image': 'marker2',
                'icon-size': 1.0,
                'icon-anchor': 'bottom',
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
                'icon-optional': true
            },
        });

        map.addLayer({
            id: 'places-active-ra',
            type: 'symbol',
            source: 'places',
            filter: ['all', ['==', 'active', true], ['==', 'source', 'ra']],
            layout: {
                'icon-image': 'marker3',
                'icon-size': 1.0,
                'icon-anchor': 'bottom',
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
                'icon-optional': true
            }
        })
        
        map.on('dragstart', () => {
            const infoPanel = document.getElementById('event-info');
            if (infoPanel.classList.contains('active')) {
                infoPanel.classList.remove('active');
            }
        })
        map.on('click', () => {
            const infoPanel = document.getElementById('event-info');
            if (infoPanel.classList.contains('active')) {
                infoPanel.classList.toggle('active');
            } 
        })
        map.on('click', ['places-active', 'places-active-ra', 'places-inactive'], (e) => {
            const props = e.features[0].properties;
            const template = document.getElementById('popup-template');
            const popupEl = template.content.cloneNode(true);
            popupEl.querySelector('.place-name').textContent = `${props.name} / ${props.name_ko}`;
            popupEl.querySelector('.kakao-map').href = props.kakaoMaps;
            popupEl.querySelector('.naver-map').href = props.naverMaps;
            popupEl.querySelector('.road-address').textContent = props.address_ko;
            popupEl.querySelector('.jibun-address').textContent = props.address_jibun;

            if (props.active) {
                const eventData = JSON.parse(props.events).filter(e => e?.date === formatDateToYMD(displayDate))[0]
                const eventTemplate = document.getElementById('popup-event-template');
                const eventEl = eventTemplate.content.cloneNode(true);
                eventEl.querySelector('.event-title').textContent = eventData.title;
                eventEl.querySelector('.event-date').textContent = eventData.date;
                eventEl.querySelector('.event-time').textContent = eventData.startTime ? formatTime(new Date(eventData.startTime.trim())) : eventData.time;
                eventEl.querySelector('.event-artist').textContent = eventData.artists instanceof Array ? eventData.artists.join(', ') : eventData.artist;
                eventEl.querySelector('.event-ticket').textContent = (eventData.source === 'ra') ? "Resident Advisor" : eventData.entry;
                eventEl.querySelector('.event-ticket').href = (eventData.source === 'ra') ? eventData.eventUrl : eventData.ticket;
                // eventEl.querySelector('.event-entry').textContent = eventData.entry;
                popupEl.querySelector('.popup-event').replaceWith(eventEl);
            } else {
                popupEl.querySelector('.popup-event').remove();
            }

            const popup = new maplibregl.Popup({ offset: 10 })
                .addClassName('map-event-popup')
                .setLngLat(e.lngLat)
                .setDOMContent(popupEl)
                .addTo(map);
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    loadMap();
})
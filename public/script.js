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

const sunIconSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="5"></circle>
        <line x1="12" y1="1" x2="12" y2="3"></line>
        <line x1="12" y1="21" x2="12" y2="23"></line>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
        <line x1="1" y1="12" x2="3" y2="12"></line>
        <line x1="21" y1="12" x2="23" y2="12"></line>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
    </svg>
`;

const moonIconSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
    </svg>
`;

class ThemeToggleControl {
    constructor() {
        this._isDark = false;
        this._map = null;
        this._container = null;
        this._button = null;
    }
    onAdd(map) {
        this._map = map;
        this._container = document.createElement('div');
        this._container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
        this._button = document.createElement('button');
        this._button.className = 'theme-toggle-button';
        this._button.setAttribute('title', 'Toggle Map Theme');
        this._updateButtonContent();
        this._button.onclick = () => this._toggleTheme();
        this._container.appendChild(this._button);
        return this._container;
    }
    onRemove() {
        if (this._container && this._container.parentNode) {
            this._container.parentNode.removeChild(this._container);
        }
        this._map = undefined;
    }
    _updateButtonContent() {
        this._button.innerHTML = this._isDark ? sunIconSvg : moonIconSvg; // Sun for light, Moon for dark
    }
    _toggleTheme() {
        this._isDark = !this._isDark;
        this._updateButtonContent();
        document.documentElement.style.colorScheme = this._isDark ? 'dark' : 'light';
        if (this._isDark) {
            this._map.setStyle('./dark.json', { diff: false });
            document.getElementById('map').classList.add('dark');
        } else {
            this._map.setStyle('./light.json', { diff: false });
            document.getElementById('map').classList.remove('dark');
        }
    }
    setInitialTheme(isDark) {
        this._isDark = isDark;
        this._updateButtonContent();
        document.documentElement.style.colorScheme = this._isDark ? 'dark' : 'light';
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

function formatTimeText(start, end) {
    if (!start && !end) return "";
    let startTime = formatTime(new Date(start));
    if (end !== undefined) {
        startTime += ' - ' + formatTime(new Date(end));  
    }
    return startTime;
}

async function loadMap() {
    const metadataRaw = await fetch('./metadata.json');
    const metadata = await metadataRaw.json();
    const geojsonRaw = await fetch("./data.json");
    let geojson = await geojsonRaw.json();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let displayDate = today;

    // For initial load, set venues with events today as active
    updateActiveVenuesByDate(geojson, today)
    document.getElementById("calendar-date-label").textContent = formatDateToYMD(displayDate);

    // Count events for calendar badges
    let eventCounts = geojson?.features?.flatMap(f => f.properties?.events || [])
        .reduce((acc, event) => {
            if (!event?.date) return acc;
            acc[event.date] = (acc[event.date] || 0) + 1;
            return acc
        }, {})
    let totalDates = Object.keys(eventCounts).length;
    // let totalEvents = Object.values(eventCounts).reduce((acc, count) => acc + count, 0);
    let totalVenuesWithEvents = geojson.features.filter(feature => feature.properties.events?.length > 0).length;
    let maximumDate = Object.keys(eventCounts)
        .reduce((max, curr) => new Date(curr) > new Date(max) ? new Date(curr) : new Date(max), new Date());
    // maximumDate.setHours(23, 59, 99, 999);
    maximumDate.setDate(maximumDate.getDate() + 1);
    document.getElementById("event-info-last-update-date").textContent = metadata.updateDate;
    document.getElementById("event-info-event-count").textContent = metadata.eventCount;
    document.getElementById("event-info-date-count").textContent = totalDates;
    document.getElementById("event-info-venue-count").textContent = totalVenuesWithEvents;
    document.getElementById("event-info-end-date").textContent = maximumDate.toISOString().slice(0, 10);

    let protocol = new pmtiles.Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);

    const prefersDarkScheme = window.matchMedia("(prefers-color-scheme: dark)");

    const map = new maplibregl.Map({
        style: prefersDarkScheme.matches ? 'dark.json' : 'light.json',
        center: [126.9762, 37.5136],
        maxBounds: [
            [125.7604781765, 33.0846069507],
            [129.7426552764, 38.6782537156]
        ],
        zoom: 12,
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
            document.getElementById("calendar-date-label").textContent = date;
            const source = map.getSource('places');
            if (source) {
                source.setData(geojson)
            }
        }
    });
    
    const markerImages = [
        { id: 'marker2', options: { scale: 1 } },
        { id: 'marker3', options: { scale: 1, color: 'red' } }
    ];

    const sources = [
        { id: 'places', type: 'geojson', data: geojson }
    ];

    const layers = [
        {
            id: 'places-inactive',
            type: 'circle',
            source: 'places',
            filter: ['==', 'active', false],
            paint: {
                'circle-radius': 6,
                'circle-color': '#bbb',
                'circle-opacity': 1.0,
                'circle-stroke-width': 2,
                'circle-stroke-color': '#aaa',
            }
        },
        {
            id: 'places-active',
            type: 'symbol',
            source: 'places',
            filter: ['all', ['==', 'active', true], ['==', 'source', 'showdee']],
            layout: {
                'icon-image': 'marker2',
                'icon-size': 1,
                'icon-anchor': 'bottom',
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
                'icon-optional': true
            },
        },
        {
            id: 'places-active-ra',
            type: 'symbol',
            source: 'places',
            filter: ['all', ['==', 'active', true], ['==', 'source', 'ra']],
            layout: {
                'icon-image': 'marker3',
                'icon-size': 1,
                'icon-anchor': 'bottom',
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
                'icon-optional': true
            }
        }
    ];
    
    function addEventListeners() {
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
            const mapLinks = []
            if (props.kakaoMaps) {
                mapLinks.push(`<a href=${props.kakaoMaps} class="place-link kakao-map" target="_blank" rel="noopener noreferrer">Kakao</a>`);
            }
            if (props.naverMaps) {
                mapLinks.push(`<a href=${props.naverMaps} class="place-link naver-map" target="_blank" rel="noopener noreferrer">Naver</a>`);
            }
            if (props.googleMaps) {
                mapLinks.push(`<a href=${props.googleMaps} class="place-link google-map" target="_blank" rel="noopener noreferrer">Google</a>`);
            }
            popupEl.querySelector('.map-links').innerHTML = mapLinks.join(', ');
            popupEl.querySelector('.road-address').textContent = props.address_ko;
            if (props.instagram) {
                popupEl.querySelector('.place-instagram-link').href = props.instagram;
            } else {
                popupEl.querySelector('.place-instagram-link').remove();
            }
            if (props.facebook) {
                popupEl.querySelector('.place-facebook-link').href = props.facebook;
            } else {
                popupEl.querySelector('.place-facebook-link').remove();
            }
            if (props.website) {
                popupEl.querySelector('.place-website-link').href = props.website;
            } else {
                popupEl.querySelector('.place-website-link').remove();
            }
            if (props.active) {
                const eventData = JSON.parse(props.events).filter(e => e?.date === formatDateToYMD(displayDate))[0]
                const eventTemplate = document.getElementById('popup-event-template');
                const eventEl = eventTemplate.content.cloneNode(true);
                if (eventData.title) {
                    eventEl.querySelector('.event-title').textContent = eventData.title;
                } else {
                    eventEl.querySelector('.event-title').previousSibling.remove();
                    eventEl.querySelector('.event-title').remove();
                }
                if (eventData.artists.length > 0) {
                    eventEl.querySelector('.event-artist').textContent = eventData.artists.join(', ');
                } else {
                    eventEl.querySelector('.event-artist').previousSibling.remove();
                    eventEl.querySelector('.event-artist').remove();
                }
                eventEl.querySelector('.event-date').textContent = eventData.date;
                eventEl.querySelector('.event-time').textContent = formatTimeText(eventData.startTime, eventData.endTime);
                eventEl.querySelector('.event-ticket').textContent = (eventData.source === 'ra') ? "Resident Advisor" : eventData.entry;
                eventEl.querySelector('.event-ticket').href = eventData.eventUrl
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
    }
    
    function addToMap() {
        markerImages.forEach(marker => {
            if (!map.hasImage(marker.id)) {
                map.addMarkerImage(marker.id, marker.options);
            }
        });
        sources.forEach(source => {
            if (!map.getSource(source.id)) {
                map.addSource(source.id, { type: source.type, data: source.data });
            }
        });
        layers.forEach(layer => {
            if (!map.getLayer(layer.id)) {
                map.addLayer(layer);
            }
        });
    }

    const themeToggleControl = new ThemeToggleControl();
    const setTheme = (isDark) => {
        if (isDark) {
            map.setStyle('./dark.json', { diff: false })
            document.getElementById('map').classList.add('dark');
            document.documentElement.style.colorScheme ='dark';
        } else {
            map.setStyle('./light.json', { diff: false })
            document.getElementById('map').classList.remove('dark');
            document.documentElement.style.colorScheme ='light';
        }
        themeToggleControl._isDark = isDark;
        themeToggleControl._updateButtonContent();
    }

    prefersDarkScheme.addEventListener("change", (e) => { setTheme(e.matches) });
   
    map.on('load', () => {
        map.addControl(new maplibregl.NavigationControl());
        map.addControl(new maplibregl.FullscreenControl());
        map.addControl(new maplibregl.GeolocateControl({
            positionOptions: {
                enableHighAccuracy: true
            },
            trackUserLocation: true
        }));
        map.addControl(themeToggleControl);
        addToMap();
        addEventListeners();
        setTheme(prefersDarkScheme.matches);
        themeToggleControl.setInitialTheme(prefersDarkScheme.matches);
    });

    map.on('style.load', () => {
        addToMap();
    });

}

document.addEventListener('DOMContentLoaded', () => {
    loadMap();
})
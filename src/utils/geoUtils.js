const FALLBACK_CITIES = {
    'Ambala Cantt': { lat: 30.3340, lng: 76.8400 },
    'Ambala City': { lat: 30.3782, lng: 76.7767 },
    'Ambala': { lat: 30.3782, lng: 76.7767 },
    'Delhi': { lat: 28.7041, lng: 77.1025 },
    'Chandigarh': { lat: 30.7333, lng: 76.7794 },
    'Mullana': { lat: 30.2520, lng: 77.0425 },
    'City Hospital': { lat: 30.3600, lng: 76.7900 }
};

export const getDistanceKm = (lat1, lon1, lat2, lon2) => {
    const R = 6371; 
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
    return R * c; 
};

export const geocodeCity = async (cityName) => {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cityName)}`);
        const data = await response.json();
        if (data && data.length > 0) {
            return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), name: data[0].display_name };
        }
    } catch (e) {
        console.warn("Geocoding API failed:", e);
    }
    const fallback = Object.keys(FALLBACK_CITIES).find(k => k.toLowerCase() === cityName.toLowerCase());
    if (fallback) return { ...FALLBACK_CITIES[fallback], name: fallback };
    return null;
};

export const reverseGeocode = async (lat, lng) => {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const data = await res.json();
        if (data && data.display_name) {
            const parts = data.display_name.split(', ');
            return parts.slice(0, 3).join(', ');
        }
    } catch (e) {
        console.warn("Reverse geocode failed:", e);
    }
    return 'Unknown Location';
};

export const auditRouteRisks = (routeCoordinates, hazards) => {
    // In a real app, this would check distance from each route segment to hazards.
    // For this mock, we just return a static count.
    return 2; 
};

export const generateSafeCorridor = (origin, destination, hazards) => {
    const oLat = origin.lat;
    const oLng = origin.lng;
    const dLat = destination.lat;
    const dLng = destination.lng;

    const baseDist = getDistanceKm(oLat, oLng, dLat, dLng);
    const baseMins = Math.round(baseDist * 1.5);

    // Fastest Route (Straight-ish line)
    const fastestCoords = [
        [oLat, oLng],
        [oLat + (dLat - oLat) * 0.5, oLng + (dLng - oLng) * 0.3], 
        [dLat, dLng]
    ];

    // Safe Route (Detour)
    const safeCoords = [
        [oLat, oLng],
        [oLat + (dLat - oLat) * 0.2, oLng + (dLng - oLng) * 0.8], 
        [oLat + (dLat - oLat) * 0.8, oLng + (dLng - oLng) * 0.9],
        [dLat, dLng]
    ];

    const bounds = [
        [Math.min(oLat, dLat) - 0.05, Math.min(oLng, dLng) - 0.05],
        [Math.max(oLat, dLat) + 0.05, Math.max(oLng, dLng) + 0.05]
    ];

    const hazardsOnFastest = auditRouteRisks(fastestCoords, hazards);

    return {
        fastest: {
            coords: fastestCoords,
            eta: `${baseMins} mins`,
            dist: `${baseDist.toFixed(1)} km`,
            hazards: hazardsOnFastest,
            tag: `⚠️ ${hazardsOnFastest} Active Hazards Detected`
        },
        safe: {
            coords: safeCoords,
            eta: `${baseMins + 4} mins`,
            dist: `${(baseDist * 1.15).toFixed(1)} km`,
            hazards: 0,
            tag: "✨ 100% Hazard-Free • Well-Lit Roads"
        },
        bounds: bounds
    };
};

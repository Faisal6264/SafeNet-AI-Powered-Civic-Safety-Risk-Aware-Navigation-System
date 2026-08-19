const { useState, useEffect, useRef, useCallback } = React;

const SUPABASE_URL = 'YOUR_SUPABASE_URL_HERE';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY_HERE';

let supabase = null;
try {
    if (SUPABASE_URL.startsWith('http') && !SUPABASE_URL.includes('YOUR_')) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
} catch (e) {
    console.warn("Supabase init skipped:", e.message);
}

const DEFAULT_CENTER = { lat: 30.3782, lng: 76.7767 };

const FALLBACK_CITIES = {
    'Ambala Cantt': { lat: 30.3340, lng: 76.8400 },
    'Ambala City': { lat: 30.3782, lng: 76.7767 },
    'Ambala': { lat: 30.3782, lng: 76.7767 },
    'Delhi': { lat: 28.7041, lng: 77.1025 },
    'Chandigarh': { lat: 30.7333, lng: 76.7794 },
    'Mullana': { lat: 30.2520, lng: 77.0425 },
    'City Hospital': { lat: 30.3600, lng: 76.7900 }
};

const geocodeCity = async (cityName) => {
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

// LocalStorage DB Helpers
const getUserStore = () => {
    try {
        return JSON.parse(localStorage.getItem('safenet_users_store')) || [];
    } catch {
        return [];
    }
};

const saveUserStore = (users) => {
    localStorage.setItem('safenet_users_store', JSON.stringify(users));
};

const getActiveSession = () => {
    try {
        return JSON.parse(localStorage.getItem('safenet_active_session'));
    } catch {
        return null;
    }
};

const saveActiveSession = (user) => {
    if (user) {
        localStorage.setItem('safenet_active_session', JSON.stringify(user));
    } else {
        localStorage.removeItem('safenet_active_session');
    }
};

const MOCK_HAZARDS = [
    { id: 'ambala-hz-01', category: 'Road Hazard', description: 'Severe Waterlogging & Potholes near Railway Underpass. Deep water accumulation and large potholes causing severe traffic jam for two-wheelers and buses.', severity: 'High', latitude: 30.3298, longitude: 76.8373, city: 'Ambala', reporter_name: 'FAISAL', confirmations: 9, appreciation_count: 5, created_at: new Date(Date.now() - 3600000).toISOString(), status: 'active', is_ai_verified: true, ai_advisory: '⚠️ High risk of engine stalls and vehicle damage during morning and evening rush hours.' },
    { id: 'ambala-hz-02', category: 'Dangerous Condition', description: 'Broken Streetlight & Hanging Low-Tension Wire. Unlit crossing with loose electrical cables dangling close to the main road.', severity: 'High', latitude: 30.3625, longitude: 76.8045, city: 'Ambala', reporter_name: 'FAISAL', confirmations: 6, appreciation_count: 3, created_at: new Date(Date.now() - 7200000).toISOString(), status: 'active', is_ai_verified: true, ai_advisory: '⚠️ Severe electrocution and collision hazard after sunset. Caution advised.' },
    { id: 'ambala-hz-03', category: 'Civic Maintenance', description: 'Open Drain & Construction Rubble. Uncovered storm drain and gravel dumped on pedestrian walkway.', severity: 'Medium', latitude: 30.3785, longitude: 76.7765, city: 'Ambala', reporter_name: 'PRIYA S.', confirmations: 4, appreciation_count: 2, created_at: new Date(Date.now() - 14400000).toISOString(), status: 'active', is_ai_verified: true, ai_advisory: '🟡 Narrow road bottleneck; pedestrian slip risk.' },
    { id: 'ambala-hz-04', category: 'Road Hazard', description: 'Stray Cattle & Missing Divider Reflectors. Unmarked central median with frequent stray animal crossings.', severity: 'Medium', latitude: 30.2520, longitude: 77.0420, city: 'Ambala', reporter_name: 'AMIT K.', confirmations: 7, appreciation_count: 4, created_at: new Date(Date.now() - 28800000).toISOString(), status: 'active', is_ai_verified: true, ai_advisory: '🟡 High-speed braking risk; maintain speed below 50 km/h.' }
];

const MOCK_PROFILES = [
    { id: 'u1', full_name: 'Faisal', city: 'Ambala', latitude: 30.3782, longitude: 76.7767, is_verified: true },
    { id: 'u2', full_name: 'Priya S.', city: 'Ambala', latitude: 30.3600, longitude: 76.8000, is_verified: true },
    { id: 'u3', full_name: 'Amit K.', city: 'Ambala', latitude: 30.2500, longitude: 77.0400, is_verified: true },
    ...Array.from({length: 20}).map((_, i) => ({
        id: `u_mock_${i}`,
        full_name: `Citizen ${i}`,
        city: 'Ambala',
        latitude: 30.3782 + (Math.random() - 0.5) * 0.05,
        longitude: 76.7767 + (Math.random() - 0.5) * 0.05,
        is_verified: true
    }))
];

// Clean up any stale state or local storage that might have old coordinates
try {
    const store = JSON.parse(localStorage.getItem('safenet_users_store'));
    if (store && store.length > 0) {
        const isIndia = store.some(u => u.city.toLowerCase() === 'ambala' || u.city.toLowerCase() === 'delhi');
        if (!isIndia) {
            localStorage.removeItem('safenet_users_store');
            localStorage.removeItem('safenet_active_session');
        }
    }
} catch(e){}

const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; 
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
    return R * c; 
};

const findClusters = (activeHazards) => {
    const clusters = [];
    const visited = new Set();
    activeHazards.forEach((h1, i) => {
        if(visited.has(h1.id)) return;
        const currentCluster = [h1];
        visited.add(h1.id);
        activeHazards.forEach((h2, j) => {
            if(i !== j && !visited.has(h2.id)) {
                if(calculateDistance(h1.latitude, h1.longitude, h2.latitude, h2.longitude) <= 0.4) {
                    currentCluster.push(h2);
                    visited.add(h2.id);
                }
            }
        });
        if(currentCluster.length >= 2) {
            const avgLat = currentCluster.reduce((sum, h) => sum + h.latitude, 0) / currentCluster.length;
            const avgLng = currentCluster.reduce((sum, h) => sum + h.longitude, 0) / currentCluster.length;
            clusters.push({ lat: avgLat, lng: avgLng, count: currentCluster.length, hazards: currentCluster });
        }
    });
    return clusters;
};

// Icons
const ShieldIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>);
const BellIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>);
const ChartIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"></path><path d="M18 17V9"></path><path d="M13 17V5"></path><path d="M8 17v-3"></path></svg>);
const SpinnerIcon = () => (<svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>);

const TILE_PROVIDERS = {
    satellite: {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: '&copy; Esri, Maxar, Earthstar Geographics'
    },
    dark: {
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        attribution: '&copy; CARTO &copy; OpenStreetMap'
    },
    streets: {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; OpenStreetMap contributors'
    }
};

const LeafletMap = ({ center, hazards, onMarkerClick, isSelectingLocation, onLocationSelect, mapFocusLocation, formLocation, isReporting, clusters, safeRideRoutes, selectedRoute, activeMapLayer }) => {
    const mapRef = useRef(null);
    const mapInstance = useRef(null);
    const markersLayer = useRef(null);
    const selectionMarker = useRef(null);
    const userMarker = useRef(null);
    const clustersLayer = useRef(null);
    const navLayer = useRef(null);

    const tileLayerRef = useRef(null);

    useEffect(() => {
        if (!mapInstance.current && mapRef.current) {
            mapInstance.current = L.map(mapRef.current, { zoomControl: false }).setView([center.lat, center.lng], 13);
            L.control.zoom({ position: 'topright' }).addTo(mapInstance.current);
            
            const provider = TILE_PROVIDERS[activeMapLayer] || TILE_PROVIDERS.dark;
            tileLayerRef.current = L.tileLayer(provider.url, {
                attribution: provider.attribution,
                maxZoom: 19
            }).addTo(mapInstance.current);

            markersLayer.current = L.featureGroup().addTo(mapInstance.current);
            clustersLayer.current = L.featureGroup().addTo(mapInstance.current);
            navLayer.current = L.featureGroup().addTo(mapInstance.current);

            mapInstance.current.on('click', (e) => {
                if (isSelectingLocation || isReporting) {
                    const { lat, lng } = e.latlng;
                    onLocationSelect({ lat: parseFloat(lat.toFixed(5)), lng: parseFloat(lng.toFixed(5)) });
                }
            });
        }
    }, []);

    useEffect(() => {
        if (mapInstance.current && tileLayerRef.current) {
            mapInstance.current.removeLayer(tileLayerRef.current);
            const provider = TILE_PROVIDERS[activeMapLayer] || TILE_PROVIDERS.dark;
            tileLayerRef.current = L.tileLayer(provider.url, {
                attribution: provider.attribution,
                maxZoom: 19
            }).addTo(mapInstance.current);
        }
    }, [activeMapLayer]);

    useEffect(() => {
        if (mapInstance.current && mapFocusLocation) {
            mapInstance.current.flyTo([mapFocusLocation.lat, mapFocusLocation.lng], 14, { duration: 1.5, animate: true });
        }
    }, [mapFocusLocation]);

    useEffect(() => {
        if (mapInstance.current && isSelectingLocation) {
            L.DomUtil.addClass(mapInstance.current._container, 'cursor-crosshair');
        } else if (mapInstance.current) {
            L.DomUtil.removeClass(mapInstance.current._container, 'cursor-crosshair');
        }
    }, [isSelectingLocation]);

    useEffect(() => {
        if (mapInstance.current) {
            if (center.lat !== DEFAULT_CENTER.lat || center.lng !== DEFAULT_CENTER.lng) {
                if (userMarker.current) {
                    userMarker.current.setLatLng([center.lat, center.lng]);
                } else {
                    const icon = L.divIcon({
                        html: `<div class="relative flex h-8 w-8 items-center justify-center">
                                 <span class="animate-radar-ripple absolute inline-flex h-full w-full rounded-full bg-blue-500"></span>
                                 <span class="relative inline-flex rounded-full h-4 w-4 bg-blue-600 border-2 border-white shadow-md z-10"></span>
                               </div>`,
                        className: 'custom-leaflet-icon',
                        iconSize: [32, 32],
                        iconAnchor: [16, 16],
                    });
                    userMarker.current = L.marker([center.lat, center.lng], { icon, zIndexOffset: 1000 }).addTo(mapInstance.current);
                }
            }
        }
    }, [center]);

    useEffect(() => {
        if (mapInstance.current) {
            if (formLocation && (isReporting || isSelectingLocation)) {
                if (selectionMarker.current) {
                    selectionMarker.current.setLatLng([formLocation.lat, formLocation.lng]);
                } else {
                    const pinIcon = L.divIcon({
                        html: `<div class="relative flex h-8 w-8 items-center justify-center transform -translate-y-4">
                                 <span class="animate-bounce absolute inline-flex h-full w-full rounded-full bg-gray-900 opacity-20"></span>
                                 <span class="relative inline-flex rounded-full h-5 w-5 bg-gray-900 border-2 border-white shadow-lg"></span>
                               </div>`,
                        className: 'custom-leaflet-icon',
                        iconSize: [32, 32],
                        iconAnchor: [16, 32],
                    });
                    selectionMarker.current = L.marker([formLocation.lat, formLocation.lng], { icon: pinIcon, draggable: true }).addTo(mapInstance.current);
                    
                    selectionMarker.current.on('dragend', (e) => {
                        const position = e.target.getLatLng();
                        onLocationSelect({ lat: parseFloat(position.lat.toFixed(5)), lng: parseFloat(position.lng.toFixed(5)) });
                    });
                }
            } else {
                if (selectionMarker.current) {
                    mapInstance.current.removeLayer(selectionMarker.current);
                    selectionMarker.current = null;
                }
            }
        }
    }, [formLocation, isReporting, isSelectingLocation]);

    useEffect(() => {
        if (clustersLayer.current) {
            clustersLayer.current.clearLayers();
            clusters.forEach(cluster => {
                L.circle([cluster.lat, cluster.lng], {
                    color: '#ef4444',
                    fillColor: '#f87171',
                    fillOpacity: 0.25,
                    dashArray: '6, 6',
                    radius: 350
                }).addTo(clustersLayer.current);

                const labelIcon = L.divIcon({
                    html: `<div class="bg-red-600/90 backdrop-blur-md text-white text-[10px] font-black px-3 py-1.5 rounded-full shadow-lg border border-red-400 animate-pulse whitespace-nowrap flex items-center gap-1.5 transform -translate-x-1/2 -translate-y-6">
                            🔥 AI Predicted High-Risk Zone
                           </div>`,
                    className: 'custom-leaflet-icon',
                    iconSize: [0, 0],
                    iconAnchor: [0, 0]
                });
                L.marker([cluster.lat, cluster.lng], { icon: labelIcon, interactive: false }).addTo(clustersLayer.current);
            });
        }
    }, [clusters]);

    useEffect(() => {
        if (navLayer.current) {
            navLayer.current.clearLayers();
            
            if (safeRideRoutes) {
                // Draw Fastest Route
                const fastestPoly = L.polyline(safeRideRoutes.fastest.coords, {
                    color: selectedRoute === 'fastest' ? '#ef4444' : '#fca5a5',
                    weight: selectedRoute === 'fastest' ? 6 : 4,
                    dashArray: '10, 10',
                    opacity: selectedRoute === 'fastest' ? 1 : 0.6
                }).addTo(navLayer.current);

                // Draw Safe Route (Glowing effect)
                if (selectedRoute === 'safe') {
                    L.polyline(safeRideRoutes.safe.coords, {
                        color: '#0ea5e9',
                        weight: 12,
                        opacity: 0.3
                    }).addTo(navLayer.current);
                }
                const safePoly = L.polyline(safeRideRoutes.safe.coords, {
                    color: selectedRoute === 'safe' ? '#06b6d4' : '#67e8f9',
                    weight: selectedRoute === 'safe' ? 6 : 4,
                    opacity: selectedRoute === 'safe' ? 1 : 0.6
                }).addTo(navLayer.current);

                // Start / End Markers
                const startPoint = safeRideRoutes.fastest.coords[0];
                const endPoint = safeRideRoutes.fastest.coords[safeRideRoutes.fastest.coords.length - 1];
                
                L.circleMarker(startPoint, { color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 1, radius: 6, weight: 2, color: 'white' }).addTo(navLayer.current);
                L.circleMarker(endPoint, { color: '#000', fillColor: '#000', fillOpacity: 1, radius: 6, weight: 2, color: 'white' }).addTo(navLayer.current);

                if (safeRideRoutes.bounds) {
                    mapInstance.current.fitBounds(safeRideRoutes.bounds, { padding: [50, 50], animate: true, duration: 1.5 });
                }
            }
        }
    }, [safeRideRoutes, selectedRoute]);

    useEffect(() => {
        if (markersLayer.current) {
            markersLayer.current.clearLayers();
            hazards.forEach(hazard => {
                let iconHtml = '';
                if (hazard.severity === 'High') {
                    iconHtml = `<div class="relative flex h-8 w-8 items-center justify-center cursor-pointer hover:scale-125 transition-transform">
                                  <span class="animate-radar-ripple absolute inline-flex h-full w-full rounded-full bg-red-500"></span>
                                  <span class="relative inline-flex rounded-full h-4 w-4 bg-red-600 border-2 border-white shadow-md z-10"></span>
                                </div>`;
                } else if (hazard.severity === 'Medium') {
                    iconHtml = `<div class="relative flex h-8 w-8 items-center justify-center cursor-pointer hover:scale-125 transition-transform">
                                  <span class="animate-pulse absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                  <span class="relative inline-flex rounded-full h-4 w-4 bg-amber-500 border-2 border-white shadow-md z-10"></span>
                                </div>`;
                } else {
                    iconHtml = `<div class="relative flex h-8 w-8 items-center justify-center cursor-pointer hover:scale-125 transition-transform">
                                  <span class="relative inline-flex rounded-full h-4 w-4 bg-green-500 border-2 border-white shadow-md z-10 shadow-[0_0_12px_rgba(34,197,94,0.6)]"></span>
                                </div>`;
                }
                
                const icon = L.divIcon({
                    html: iconHtml,
                    className: 'custom-leaflet-icon',
                    iconSize: [32, 32],
                    iconAnchor: [16, 16],
                });

                L.marker([hazard.latitude, hazard.longitude], { icon })
                    .addTo(markersLayer.current)
                    .on('click', () => onMarkerClick(hazard));
            });
        }
    }, [hazards, onMarkerClick]);

    return <div ref={mapRef} className="absolute inset-0 z-10 rounded-tl-3xl shadow-[-10px_0_30px_rgba(0,0,0,0.05)]" />;
};

const App = () => {
    // Session & Auth State
    const [session, setSession] = useState(null);
    const [authView, setAuthView] = useState(null); 
    const [authMethod, setAuthMethod] = useState('email'); // 'email' or 'phone'
    const [authForm, setAuthForm] = useState({ full_name: '', email: '', phone: '', city: '', password: '', otp: '' });
    const [isOtpLogin, setIsOtpLogin] = useState(false);
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const [generatedOtp, setGeneratedOtp] = useState('');
    const [pendingUser, setPendingUser] = useState(null);

    // Hazard & Map State
    const [allHazards, setAllHazards] = useState([]); // Contains both active and resolved
    const [clusters, setClusters] = useState([]);
    const [userLocation, setUserLocation] = useState(DEFAULT_CENTER);
    const [isReporting, setIsReporting] = useState(false);
    const [selectedHazard, setSelectedHazard] = useState(null);
    const [safetyStatus, setSafetyStatus] = useState({ label: 'Safe', level: 'low' });
    const [isSelectingLocation, setIsSelectingLocation] = useState(false);
    const [formLocation, setFormLocation] = useState(null);
    const [landmarkName, setLandmarkName] = useState('');
    const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
    const [isLocating, setIsLocating] = useState(false);
    const [locationSuccess, setLocationSuccess] = useState(false);
    const [mapFocusLocation, setMapFocusLocation] = useState(null);
    
    // Dashboard & SafeRide State
    const [dashboardTab, setDashboardTab] = useState('feed'); // 'feed' | 'saferide'
    const [safeRideOrigin, setSafeRideOrigin] = useState(null); // Will default to userLocation logic
    const [safeRideDest, setSafeRideDest] = useState(''); // Text input
    const [safeRideRoutes, setSafeRideRoutes] = useState(null);
    const [selectedRoute, setSelectedRoute] = useState('safe');
    const [isActiveTrip, setIsActiveTrip] = useState(false);
    const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
    
    // Map Settings
    const [activeMapLayer, setActiveMapLayer] = useState('dark');

    // UI states
    const [mobileView, setMobileView] = useState('dashboard');
    const [currentFilter, setCurrentFilter] = useState('All');
    const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [showAppreciationToast, setShowAppreciationToast] = useState(false);
    const [globalAlert, setGlobalAlert] = useState(null);
    const [toasts, setToasts] = useState([]);

    // Form state
    const [category, setCategory] = useState('Road Hazard');
    const [description, setDescription] = useState('');
    const [severity, setSeverity] = useState('Medium');
    const [aiAdvisory, setAiAdvisory] = useState('');
    const [isAiVerified, setIsAiVerified] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const activeHazards = allHazards.filter(h => h.status === 'active');
    const resolvedCount = allHazards.filter(h => h.status === 'resolved').length;

    const showToast = useCallback((message, type = 'error') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 6000);
    }, []);

    const reverseGeocode = async (lat, lng) => {
        setIsReverseGeocoding(true);
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
            const data = await res.json();
            if(data && data.display_name) {
                // Simplify the address string by taking the first 3 parts
                const parts = data.display_name.split(', ');
                setLandmarkName(parts.slice(0, 3).join(', '));
            } else {
                setLandmarkName('Unknown Location');
            }
        } catch(e) {
            setLandmarkName('Location lookup failed');
        }
        setIsReverseGeocoding(false);
    };

    const fetchLocation = async (autoFocus = true, fromForm = false, fallbackCityName = null) => {
        const handleGeocodeFallback = async () => {
            if (fallbackCityName) {
                const coords = await geocodeCity(fallbackCityName);
                if (coords) {
                    setUserLocation(coords);
                    if(autoFocus) {
                        setMapFocusLocation(coords);
                        if(mobileView === 'dashboard') setMobileView('map');
                    }
                    if(fromForm) {
                        setFormLocation(coords);
                        setLocationSuccess(true);
                        reverseGeocode(coords.lat, coords.lng);
                    }
                    showToast(`Centered map to ${fallbackCityName}`, 'success');
                    return;
                }
            }
            if(fromForm) showToast("Location denied. Please select on map.", 'error');
            else if(autoFocus) showToast("Location denied. Using default center.", 'error');
        };

        if (navigator.geolocation) {
            setIsLocating(true);
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const loc = { lat: position.coords.latitude, lng: position.coords.longitude };
                    setUserLocation(loc);
                    if(autoFocus) {
                        setMapFocusLocation(loc);
                        if(mobileView === 'dashboard') setMobileView('map');
                    }
                    if(fromForm) {
                        setFormLocation(loc);
                        setLocationSuccess(true);
                        reverseGeocode(loc.lat, loc.lng);
                    }
                    setIsLocating(false);
                },
                async (error) => {
                    console.error("Location error:", error);
                    setIsLocating(false);
                    await handleGeocodeFallback();
                },
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
            );
        } else {
            showToast("Geolocation is not supported by this browser.", 'error');
            await handleGeocodeFallback();
        }
    };

    useEffect(() => {
        const activeSession = getActiveSession();
        if (activeSession) {
            setSession(activeSession);
            fetchLocation(true, false, activeSession.city);
        } else {
            fetchLocation(true, false, null);
        }
        fetchHazards();
    }, []);

    useEffect(() => {
        calculateSafetyStatus(activeHazards);
        setClusters(findClusters(activeHazards));
    }, [allHazards]);

    const fetchHazards = async () => {
        if (!supabase) {
            setAllHazards(MOCK_HAZARDS);
            return;
        }
        try {
            const { data, error } = await supabase.from('hazards').select('*');
            if (error) throw error;
            setAllHazards(data);
        } catch (err) {
            setAllHazards(MOCK_HAZARDS);
        }
    };

    const calculateSafetyStatus = (currentHazards) => {
        const hasHigh = currentHazards.some(h => h.severity === 'High');
        const count = currentHazards.length;
        if (count > 5 || hasHigh) setSafetyStatus({ label: 'High Risk', level: 'high' });
        else if (count >= 3 && count <= 5) setSafetyStatus({ label: 'Caution', level: 'medium' });
        else setSafetyStatus({ label: 'Safe', level: 'low' });
    };

    const handleMapSelect = (loc) => {
        setFormLocation(loc);
        setIsSelectingLocation(false);
        setIsReporting(true);
        setLocationSuccess(true);
        reverseGeocode(loc.lat, loc.lng);
    };

    const triggerEmergencyBroadcast = () => {
        setGlobalAlert({
            title: "EMERGENCY ALERT: Severe Flooding Expected",
            message: "Avoid downtown main street. Emergency services have been dispatched.",
            time: new Date().toISOString()
        });
        showToast("Emergency broadcast sent to all users.", 'success');
        setTimeout(() => setGlobalAlert(null), 10000);
    };

    // SafeRide Engine Logic
    const handleCalculateRoute = async (e) => {
        e.preventDefault();
        if (!safeRideDest.trim()) {
            showToast("Please enter a destination.", "error");
            return;
        }
        
        setIsCalculatingRoute(true);
        const originCoords = safeRideOrigin || userLocation;
        let destCoords = await geocodeCity(safeRideDest);

        if (!destCoords) {
            showToast(`Could not locate ${safeRideDest}.`, 'error');
            setIsCalculatingRoute(false);
            return;
        }

        // Mock Route Generation Engine
        setTimeout(() => {
            const oLat = originCoords.lat;
            const oLng = originCoords.lng;
            const dLat = destCoords.lat;
            const dLng = destCoords.lng;

            const baseDist = calculateDistance(oLat, oLng, dLat, dLng);
            const baseMins = Math.round(baseDist * 1.5); // Mock 40km/h avg speed

            // Fastest Route (Straight-ish line)
            const fastestCoords = [
                [oLat, oLng],
                [oLat + (dLat - oLat) * 0.5, oLng + (dLng - oLng) * 0.3], // slight curve
                [dLat, dLng]
            ];

            // Safe Route (Detour)
            const safeCoords = [
                [oLat, oLng],
                [oLat + (dLat - oLat) * 0.2, oLng + (dLng - oLng) * 0.8], // wide detour
                [oLat + (dLat - oLat) * 0.8, oLng + (dLng - oLng) * 0.9],
                [dLat, dLng]
            ];

            const bounds = [
                [Math.min(oLat, dLat) - 0.05, Math.min(oLng, dLng) - 0.05],
                [Math.max(oLat, dLat) + 0.05, Math.max(oLng, dLng) + 0.05]
            ];

            setSafeRideRoutes({
                fastest: {
                    coords: fastestCoords,
                    eta: `${baseMins} mins`,
                    dist: `${baseDist.toFixed(1)} km`,
                    hazards: 2,
                    tag: "⚠️ 2 Active Hazards Detected"
                },
                safe: {
                    coords: safeCoords,
                    eta: `${baseMins + 4} mins`,
                    dist: `${(baseDist * 1.15).toFixed(1)} km`,
                    hazards: 0,
                    tag: "✨ 100% Hazard-Free • Well-Lit Roads"
                },
                bounds: bounds
            });

            setSelectedRoute('safe'); // Default to safe
            setIsCalculatingRoute(false);
            if(mobileView === 'dashboard') setMobileView('map');
        }, 1200);
    };

    const handleStartSafeRide = () => {
        setIsActiveTrip(true);
        if(mobileView === 'dashboard') setMobileView('map');
    };

    const handleEndSafeRide = () => {
        setIsActiveTrip(false);
        setSafeRideRoutes(null);
        setSafeRideDest('');
    };


    const handleAuthSubmit = async (e) => {
        e.preventDefault();
        setIsAuthenticating(true);
        
        const store = getUserStore();
        
        // Basic validations
        const isEmailMode = authMethod === 'email';
        let identifier = isEmailMode ? authForm.email.toLowerCase().trim() : authForm.phone.trim();
        
        if (!isEmailMode) {
            if (!/^\d{10}$/.test(identifier)) {
                showToast("❌ Please enter a valid 10-digit mobile number.", 'error');
                setIsAuthenticating(false);
                return;
            }
        }

        if (authView === 'signup') {
            // Check duplicates
            const exists = store.find(u => (isEmailMode && u.email === identifier) || (!isEmailMode && u.phone === identifier));
            if (exists) {
                showToast(`❌ User already registered with this ${isEmailMode ? 'email' : 'phone number'}.`, 'error');
                setIsAuthenticating(false);
                return;
            }

            if (authForm.password.length < 6) {
                showToast("❌ Password must be at least 6 characters.", 'error');
                setIsAuthenticating(false);
                return;
            }

            const newUser = {
                id: `u_${Date.now()}`,
                full_name: authForm.full_name.toUpperCase().trim(),
                email: isEmailMode ? identifier : '',
                phone: !isEmailMode ? identifier : '',
                city: authForm.city.trim(),
                password_hash: authForm.password, 
                is_verified: true,
                created_at: new Date().toISOString()
            };

            setPendingUser(newUser);

            const code = Math.floor(100000 + Math.random() * 900000).toString();
            setGeneratedOtp(code);
            
            setTimeout(() => {
                setAuthView('otp');
                setIsAuthenticating(false);
            }, 600);

        } else if (authView === 'login') {
            setTimeout(async () => {
                const matchedUser = store.find(u => 
                    (isEmailMode && u.email === identifier) || (!isEmailMode && u.phone === identifier)
                );
                
                if (!matchedUser) {
                    showToast(`❌ No account found with this ${isEmailMode ? 'email' : 'phone number'}.`, 'error');
                    setAuthForm(prev => ({...prev, password: ''}));
                    setIsAuthenticating(false);
                    return;
                }

                // If Phone + OTP Login mode
                if (!isEmailMode && isOtpLogin) {
                    setPendingUser(matchedUser);
                    const code = Math.floor(100000 + Math.random() * 900000).toString();
                    setGeneratedOtp(code);
                    setAuthView('otp');
                    setIsAuthenticating(false);
                    return;
                }

                // Password Validation
                if (matchedUser.password_hash !== authForm.password) {
                    showToast("❌ Invalid password.", 'error');
                    setAuthForm(prev => ({...prev, password: ''}));
                    setIsAuthenticating(false);
                    return;
                }
                
                saveActiveSession(matchedUser);
                setSession(matchedUser);
                setAuthView(null);
                setAuthForm({ full_name: '', email: '', phone: '', city: '', password: '', otp: '' });
                setIsAuthenticating(false);
                showToast(`✅ Logged in as ${matchedUser.full_name}`, 'success');
                
                const coords = await geocodeCity(matchedUser.city);
                if (coords) {
                    setUserLocation(coords);
                    setMapFocusLocation(coords);
                }
            }, 800);

        } else if (authView === 'otp') {
            // Verify OTP
            if (authForm.otp.trim() !== generatedOtp) {
                showToast("❌ Invalid OTP code. Please enter the correct 6-digit code.", 'error');
                setIsAuthenticating(false);
                return;
            }

            // If it's a new registration, save to store
            if (!store.find(u => u.id === pendingUser.id)) {
                const updatedStore = [...store, pendingUser];
                saveUserStore(updatedStore);
            }
            
            saveActiveSession(pendingUser);
            setSession(pendingUser);
            setAuthView(null);
            setAuthForm({ full_name: '', email: '', phone: '', city: '', password: '', otp: '' });
            setIsAuthenticating(false);
            showToast("✅ Account verified and registered!", 'success');
            
            const coords = await geocodeCity(pendingUser.city);
            if (coords) {
                setUserLocation(coords);
                setMapFocusLocation(coords);
                showToast(`Centered map to ${pendingUser.city}`, 'success');
            }
        }
    };

    const handleSignOut = () => {
        saveActiveSession(null);
        setSession(null);
        setIsProfileMenuOpen(false);
        setIsProfileModalOpen(false);
        showToast("Signed out successfully.", 'success');
    };

    const handleChangeCity = async () => {
        setIsProfileMenuOpen(false);
        const newCity = prompt("Enter your new active city:");
        if (newCity && newCity.trim().length > 0) {
            const coords = await geocodeCity(newCity.trim());
            if (coords) {
                const updatedSession = { ...session, city: newCity.trim() };
                setSession(updatedSession);
                saveActiveSession(updatedSession);

                const store = getUserStore();
                const updatedStore = store.map(u => u.id === session.id ? { ...u, city: newCity.trim() } : u);
                saveUserStore(updatedStore);

                setUserLocation(coords);
                setMapFocusLocation(coords);
                showToast(`City updated to ${newCity.trim()} and map centered.`, 'success');
            } else {
                showToast(`Could not locate ${newCity}. Please try again.`, 'error');
            }
        }
    };

    const runGeofenceSimulation = (hazardLoc, hazardCity, hazardSeverity) => {
        let matchedCount = 0;
        MOCK_PROFILES.forEach(profile => {
            const dist = calculateDistance(hazardLoc.lat, hazardLoc.lng, profile.latitude, profile.longitude);
            if (dist <= 5 || profile.city.toLowerCase() === hazardCity.toLowerCase()) {
                matchedCount++;
            }
        });

        if (matchedCount > 0) {
            setTimeout(() => {
                showToast(`📩 [SMS/Email Sent] Dispatched proximity alert to ${matchedCount} verified users in this zone for a ${hazardSeverity} severity hazard.`, 'success');
            }, 1500);
        }
    };

    const analyzeHazardText = () => {
        if(!description.trim()) {
            showToast("Please enter a description first.", 'error');
            return;
        }
        const text = description.toLowerCase();
        const critical = ['fire', 'live wire', 'flood', 'collapse', 'deep hole', 'dark'];
        const medium = ['pothole', 'broken light', 'water leak', 'debris'];
        
        let isCritical = critical.some(k => text.includes(k));
        let isMedium = medium.some(k => text.includes(k));

        if (isCritical) {
            setSeverity('High');
            setCategory('Dangerous Condition');
            setAiAdvisory('⚠️ High risk of pedestrian/vehicular accident.');
            setIsAiVerified(true);
            showToast("AI Auto-Classified as High Severity.", 'success');
        } else if (isMedium) {
            setSeverity('Medium');
            setCategory('Road Hazard');
            setAiAdvisory('⚠️ Moderate risk. Proceed with caution.');
            setIsAiVerified(true);
            showToast("AI Auto-Classified as Medium Severity.", 'success');
        } else {
            setSeverity('Low');
            setCategory('Civic Maintenance');
            setAiAdvisory('ℹ️ Low risk. Civic issue logged.');
            setIsAiVerified(true);
            showToast("AI Auto-Classified as Low Severity.", 'success');
        }
    };

    const submitReport = async (e) => {
        e.preventDefault();
        
        if (!session) {
            setAuthView('login');
            showToast("Please sign in to report a hazard.", 'error');
            return;
        }

        if (!category || !severity || !description.trim()) {
            showToast("Please fill out all fields.", 'error'); return;
        }
        
        if (!formLocation) {
            showToast("Location is required. Please select on map or use current location.", 'error');
            return;
        }

        setIsSubmitting(true);
        const finalDescription = landmarkName ? `${description} (Near: ${landmarkName})` : description;
        
        const newHazard = {
            category,
            description: finalDescription,
            severity,
            latitude: formLocation.lat,
            longitude: formLocation.lng,
            city: session.city || 'New York',
            reporter_name: session.full_name,
            confirmations: 1,
            appreciation_count: 0,
            status: 'active',
            ai_advisory: aiAdvisory || null,
            is_ai_verified: isAiVerified,
            created_at: new Date().toISOString()
        };

        if (!supabase) {
            setTimeout(() => {
                const mockObj = { ...newHazard, id: `m${Date.now()}` };
                setAllHazards(prev => [...prev, mockObj]);
                resetForm();
                setMapFocusLocation({lat: mockObj.latitude, lng: mockObj.longitude});
                setMobileView('map');
                showToast("Report submitted successfully!", 'success');
                runGeofenceSimulation({lat: mockObj.latitude, lng: mockObj.longitude}, mockObj.city, mockObj.severity);
            }, 800);
            return;
        }

        try {
            const { data, error } = await supabase.from('hazards').insert([newHazard]).select();
            if (error) throw error;
            setAllHazards(prev => [...prev, data[0]]);
            resetForm();
            setMapFocusLocation({lat: data[0].latitude, lng: data[0].longitude});
            setMobileView('map');
            showToast("Report submitted successfully!", 'success');
            runGeofenceSimulation({lat: data[0].latitude, lng: data[0].longitude}, session.city, severity);
        } catch (err) {
            console.error('Database insert failure:', err);
            showToast("Failed to submit report. Please check database connection.", 'error');
            setIsSubmitting(false);
        }
    };

    const resetForm = () => {
        setIsReporting(false);
        setCategory('Road Hazard');
        setDescription('');
        setSeverity('Medium');
        setAiAdvisory('');
        setIsAiVerified(false);
        setIsSelectingLocation(false);
        setFormLocation(null);
        setLandmarkName('');
        setLocationSuccess(false);
        setIsSubmitting(false);
    };

    const requireAuth = () => {
        if (!session) {
            setAuthView('login');
            showToast("Please sign in to perform this action.", 'error');
            return false;
        }
        return true;
    };

    const confirmHazard = async (hazard) => {
        if (!requireAuth()) return;
        
        const updatedHazards = allHazards.map(h => h.id === hazard.id ? { ...h, confirmations: h.confirmations + 1 } : h);
        
        if (!supabase) {
            setAllHazards(updatedHazards);
            setSelectedHazard({ ...hazard, confirmations: hazard.confirmations + 1 });
            showToast("Hazard confirmed!", 'success');
            return;
        }
        try {
            const { error } = await supabase.from('hazards').update({ confirmations: hazard.confirmations + 1 }).eq('id', hazard.id);
            if (error) throw error;
            setAllHazards(updatedHazards);
            setSelectedHazard({ ...hazard, confirmations: hazard.confirmations + 1 });
            showToast("Hazard confirmed!", 'success');
        } catch (err) {
            showToast("Failed to confirm hazard.", 'error');
        }
    };

    const markResolved = async (hazard) => {
        if (!requireAuth()) return;

        const updatedHazards = allHazards.map(h => h.id === hazard.id ? { ...h, status: 'resolved' } : h);

        if (!supabase) {
            setAllHazards(updatedHazards);
            setSelectedHazard(null);
            showToast("Hazard marked as resolved. Thank you for keeping the community safe!", 'success');
            return;
        }
        try {
            const { error } = await supabase.from('hazards').update({ status: 'resolved' }).eq('id', hazard.id);
            if (error) throw error;
            setAllHazards(updatedHazards);
            setSelectedHazard(null);
            showToast("Hazard marked as resolved. Thank you for keeping the community safe!", 'success');
        } catch (err) {
            showToast("Failed to mark as resolved.", 'error');
        }
    };

    const appreciateReporter = async (hazard) => {
        if (!requireAuth()) return;

        const currentCount = hazard.appreciation_count || 0;
        const updatedHazards = allHazards.map(h => h.id === hazard.id ? { ...h, appreciation_count: currentCount + 1 } : h);
        
        setShowAppreciationToast(true);
        setTimeout(() => setShowAppreciationToast(false), 2500);

        if (!supabase) {
            setAllHazards(updatedHazards);
            setSelectedHazard({ ...hazard, appreciation_count: currentCount + 1 });
            return;
        }
        try {
            await supabase.from('hazards').update({ appreciation_count: currentCount + 1 }).eq('id', hazard.id);
            setAllHazards(updatedHazards);
            setSelectedHazard({ ...hazard, appreciation_count: currentCount + 1 });
        } catch (err) {}
    };

    const timeAgo = (dateStr) => {
        const diff = Math.floor((new Date() - new Date(dateStr)) / 60000);
        if (diff < 1) return 'Just now';
        if (diff < 60) return `${diff} min ago`;
        if (diff < 1440) return `${Math.floor(diff/60)} h ago`;
        return `${Math.floor(diff/1440)} d ago`;
    };

    const filteredHazards = activeHazards.filter(h => {
        if (currentFilter === 'All') return true;
        return h.severity === currentFilter;
    });

    // Profile KPIs Calculation
    const getProfileKPIs = () => {
        if (!session) return { userHazards: [], reportedCount: 0, appreciationCount: 0, resolvedCount: 0, rank: 'Level 1: Active Citizen' };
        
        const userHazards = allHazards.filter(h => h.reporter_name.toUpperCase() === session.full_name.toUpperCase());
        const reportedCount = userHazards.length;
        const appreciationCount = userHazards.reduce((sum, h) => sum + (h.appreciation_count || 0), 0);
        const resolved = userHazards.filter(h => h.status === 'resolved').length;
        const rank = reportedCount >= 10 ? 'Level 3: Safety Ambassador' : reportedCount >= 5 ? 'Level 2: Community Guardian' : 'Level 1: Active Citizen';
        
        return { userHazards: userHazards.sort((a,b) => new Date(b.created_at) - new Date(a.created_at)), reportedCount, appreciationCount, resolvedCount: resolved, rank };
    };

    const profileData = getProfileKPIs();

    return (
        <div className="h-screen w-full flex flex-col overflow-hidden bg-slate-50 text-gray-900 font-sans">
            
            <style>{`
                @keyframes fade-in-up { 0% { opacity: 0; transform: translateY(10px); } 100% { opacity: 1; transform: translateY(0); } }
                .animate-fade-in-up { animation: fade-in-up 0.4s ease-out forwards; }
                .scrollbar-hide::-webkit-scrollbar { display: none; }
                .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
                .glass-modal { background: rgba(255, 255, 255, 0.9); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); }
                .glass-dropdown { background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); }
            `}</style>
            
            {/* Top Navbar */}
            <header className="h-[72px] flex-shrink-0 bg-white border-b border-gray-200 px-4 sm:px-6 flex items-center justify-between z-20 shadow-sm relative">
                <div className="flex items-center gap-3">
                    <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white p-2 sm:p-2.5 rounded-xl sm:rounded-2xl shadow-sm">
                        <ShieldIcon />
                    </div>
                    <div>
                        <h1 className="text-xl sm:text-2xl font-black tracking-tight text-gray-900 leading-none">SafeNet</h1>
                        <span className="text-[9px] sm:text-[10px] text-gray-500 font-extrabold uppercase tracking-widest mt-1 block">Community Safety Hub</span>
                    </div>
                </div>
                
                {/* Center Badge */}
                <div className={`hidden md:flex px-5 py-2.5 rounded-full font-bold items-center gap-3 transition-colors border shadow-sm ${
                    safetyStatus.level === 'low' ? 'bg-green-50/90 border-green-200/60 text-green-700' :
                    safetyStatus.level === 'medium' ? 'bg-amber-50/90 border-amber-200/60 text-amber-700' :
                    'bg-red-50/90 border-red-200/60 text-red-700'
                }`}>
                    <span className="text-[10px] uppercase tracking-widest opacity-80">Area Safety</span>
                    <div className="flex items-center gap-2">
                        <span className="relative flex h-3 w-3">
                            <span className={`animate-pulse-slow absolute inline-flex h-full w-full rounded-full opacity-75 ${
                                safetyStatus.level === 'low' ? 'bg-green-400' : safetyStatus.level === 'medium' ? 'bg-amber-400' : 'bg-red-400'
                            }`}></span>
                            <span className={`relative inline-flex rounded-full h-3 w-3 ${
                                safetyStatus.level === 'low' ? 'bg-green-500' : safetyStatus.level === 'medium' ? 'bg-amber-500' : 'bg-red-500'
                            }`}></span>
                        </span>
                        <span className="text-sm tracking-wide">{safetyStatus.label}</span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative">
                        <button onClick={() => setIsNotificationsOpen(!isNotificationsOpen)} className="p-2 sm:p-2.5 bg-gray-50 hover:bg-gray-100 rounded-xl sm:rounded-2xl transition-colors text-gray-700 relative border border-gray-200">
                            <BellIcon />
                            {activeHazards.length > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-white shadow-sm">
                                    {activeHazards.length}
                                </span>
                            )}
                        </button>
                        {/* Notifications Dropdown */}
                        {isNotificationsOpen && (
                            <div className="absolute top-full right-0 mt-3 w-72 sm:w-80 glass-dropdown border border-gray-200 shadow-2xl rounded-2xl overflow-hidden animate-scale-in z-[1500]">
                                <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/80">
                                    <h3 className="font-black text-gray-900 uppercase tracking-widest text-xs">Recent Alerts</h3>
                                </div>
                                <div className="max-h-80 overflow-y-auto">
                                    {activeHazards.length === 0 ? (
                                        <div className="p-8 text-center text-gray-400 font-bold text-sm">No recent alerts.</div>
                                    ) : (
                                        [...activeHazards].sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5).map(h => (
                                            <div key={h.id} className="p-5 border-b border-gray-50 hover:bg-gray-50 transition-colors flex flex-col gap-2.5 cursor-pointer" onClick={() => { setMapFocusLocation({lat: h.latitude, lng: h.longitude}); setSelectedHazard(h); setIsNotificationsOpen(false); setMobileView('map'); }}>
                                                <div className="flex justify-between items-start">
                                                    <span className="font-extrabold text-gray-900 text-sm">{h.category}</span>
                                                    <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest">{timeAgo(h.created_at)}</span>
                                                </div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`w-2.5 h-2.5 rounded-full ${h.severity === 'High' ? 'bg-red-500' : h.severity === 'Medium' ? 'bg-amber-500' : 'bg-green-500'}`}></span>
                                                    <span className="text-xs text-gray-500 font-bold">Reported by {h.reporter_name || 'Anonymous Citizen'}</span>
                                                </div>
                                                <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest mt-1">View on map &rarr;</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {session ? (
                        <div className="relative">
                            <div 
                                className="flex items-center gap-2 bg-gray-50 hover:bg-gray-100 transition-colors p-1.5 pr-4 rounded-full cursor-pointer border border-gray-200 select-none shadow-sm" 
                                onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                            >
                                <div className="w-8 h-8 rounded-full border-2 border-white shadow-sm bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                                    {session.full_name.charAt(0).toUpperCase()}
                                </div>
                                <div className="hidden sm:flex flex-col">
                                    <span className="text-sm font-black text-gray-800 tracking-wide uppercase leading-none">{session.full_name.toUpperCase()}</span>
                                    <span className="text-[9px] text-blue-600 font-extrabold uppercase flex items-center gap-1 mt-0.5"><svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> {session.city} Verified</span>
                                </div>
                            </div>
                            
                            {/* Profile Dropdown Menu */}
                            {isProfileMenuOpen && (
                                <div className="absolute top-full right-0 mt-3 w-56 glass-dropdown border border-gray-200 shadow-2xl rounded-2xl overflow-hidden animate-scale-in z-[1500]">
                                    <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/80">
                                        <p className="text-xs font-bold text-gray-900 truncate">{session.email || session.phone}</p>
                                    </div>
                                    <div className="flex flex-col py-1">
                                        <button 
                                            onClick={() => { setIsProfileMenuOpen(false); setIsProfileModalOpen(true); }}
                                            className="text-left px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
                                        >
                                            👤 View Full Profile
                                        </button>
                                        <button 
                                            onClick={handleChangeCity}
                                            className="text-left px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
                                        >
                                            📍 Change Active City
                                        </button>
                                        <div className="h-px bg-gray-100 my-1"></div>
                                        <button 
                                            onClick={handleSignOut}
                                            className="text-left px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
                                        >
                                            🚪 Sign Out
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <button 
                            onClick={() => setAuthView('login')}
                            className="bg-gray-900 hover:bg-black text-white px-5 py-2.5 rounded-full text-xs font-black uppercase tracking-wider transition-colors shadow-sm"
                        >
                            Sign In / Register
                        </button>
                    )}
                </div>
            </header>

            {/* Global Emergency Alert Toast */}
            {globalAlert && (
                <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-[2000] w-[90%] max-w-lg bg-red-600 text-white rounded-2xl shadow-2xl p-4 animate-fade-in-up border-2 border-red-500">
                    <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2 font-black tracking-wide uppercase text-sm">
                            <span className="animate-pulse">🚨</span> {globalAlert.title}
                        </div>
                        <button onClick={() => setGlobalAlert(null)} className="text-red-200 hover:text-white">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                    <p className="text-red-100 font-medium text-sm leading-relaxed">{globalAlert.message}</p>
                </div>
            )}

            {/* Main Workspace Split */}
            <div className="flex-1 flex overflow-hidden relative">
                
                {/* LEFT COLUMN: Dashboard (Operations Panel) */}
                <aside className={`w-full md:w-[420px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col z-10 ${mobileView === 'map' ? 'hidden md:flex' : 'flex'}`}>
                    
                    {/* Dashboard Tabs */}
                    {!isActiveTrip && (
                        <div className="flex bg-gray-100 p-2 border-b border-gray-200 shrink-0">
                            <button
                                onClick={() => { setDashboardTab('feed'); handleEndSafeRide(); }}
                                className={`flex-1 py-2.5 rounded-lg text-[11px] uppercase tracking-widest font-black transition-all duration-200 flex items-center justify-center gap-2 ${dashboardTab === 'feed' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                📊 Dashboard Feed
                            </button>
                            <button
                                onClick={() => setDashboardTab('saferide')}
                                className={`flex-1 py-2.5 rounded-lg text-[11px] uppercase tracking-widest font-black transition-all duration-200 flex items-center justify-center gap-2 ${dashboardTab === 'saferide' ? 'bg-blue-50 text-blue-700 shadow-sm border border-blue-200' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                🛡️ SafeRide
                            </button>
                        </div>
                    )}

                    {isActiveTrip ? (
                        /* Active Trip HUD */
                        <div className="flex-1 bg-gradient-to-b from-slate-900 to-black text-white flex flex-col p-6 relative overflow-hidden animate-fade-in">
                            <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500 animate-pulse"></div>
                            
                            <h2 className="text-[10px] uppercase tracking-[0.3em] text-blue-400 font-black mb-6">SafeRide Active</h2>
                            
                            <div className="flex items-center gap-4 mb-8">
                                <div className="w-14 h-14 rounded-2xl bg-blue-600/20 border border-blue-500/50 flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.3)]">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black tracking-tight">Turn Left</h3>
                                    <p className="text-gray-400 font-medium text-sm">onto Jagadhri Road in 200m</p>
                                </div>
                            </div>

                            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-5 mb-auto border border-white/10">
                                <div className="flex items-center gap-3 mb-3">
                                    <span className="text-xl">✨</span>
                                    <h4 className="text-sm font-black text-emerald-400 tracking-wide uppercase">Safe Corridor Active</h4>
                                </div>
                                <p className="text-sm text-gray-300 font-medium leading-relaxed">
                                    🟢 Staying clear of Sector 7 hazard zone. Route is currently 100% clear.
                                </p>
                            </div>

                            <div className="flex flex-col gap-3 mt-8">
                                <button 
                                    onClick={() => { setIsReporting(true); if(locationSuccess) setFormLocation(userLocation); }}
                                    className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 font-black uppercase tracking-widest text-xs py-4 rounded-xl transition-colors flex items-center justify-center gap-2"
                                >
                                    🚨 Report Hazard on Route
                                </button>
                                <button 
                                    onClick={() => { handleEndSafeRide(); setDashboardTab('saferide'); }}
                                    className="bg-gray-800 hover:bg-gray-700 text-white border border-gray-700 font-black uppercase tracking-widest text-xs py-4 rounded-xl transition-colors"
                                >
                                    🛑 End Trip
                                </button>
                            </div>
                        </div>
                    ) : dashboardTab === 'saferide' ? (
                        /* SafeRide Config Panel */
                        <div className="flex-1 overflow-y-auto bg-slate-50 flex flex-col p-5 animate-fade-in">
                            <h2 className="text-lg font-black text-gray-900 mb-1 flex items-center gap-2 uppercase tracking-tight">
                                🛡️ SafeRide Navigator
                            </h2>
                            <p className="text-xs text-gray-500 font-bold mb-6">AI-Powered hazard avoidance routing.</p>

                            <form onSubmit={handleCalculateRoute} className="flex flex-col gap-4">
                                <div className="relative">
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Starting Point</label>
                                    <div className="flex gap-2">
                                        <div className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-2 shadow-sm text-sm font-bold text-gray-700">
                                            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0"></span>
                                            {safeRideOrigin ? safeRideOrigin.name || "Custom Pin" : "Current Location"}
                                        </div>
                                    </div>
                                </div>

                                <div className="relative">
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Destination</label>
                                    <div className="relative flex items-center">
                                        <span className="absolute left-4 w-2.5 h-2.5 border-2 border-red-500 rounded-full shrink-0"></span>
                                        <input 
                                            type="text" 
                                            required
                                            value={safeRideDest}
                                            onChange={(e) => setSafeRideDest(e.target.value)}
                                            placeholder="Where to?" 
                                            className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm placeholder-gray-400"
                                        />
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2 mt-1 mb-2">
                                    {['🏢 Ambala Cantt', '🏙️ Chandigarh', '🏥 City Hospital'].map(chip => (
                                        <button 
                                            key={chip}
                                            type="button"
                                            onClick={() => setSafeRideDest(chip.substring(3))}
                                            className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg transition-colors border border-gray-200"
                                        >
                                            {chip}
                                        </button>
                                    ))}
                                </div>

                                <button 
                                    type="submit" 
                                    disabled={isCalculatingRoute}
                                    className={`w-full text-white font-black py-3.5 rounded-xl shadow-md transition-all text-xs tracking-wide uppercase mt-2 flex justify-center items-center gap-2 ${isCalculatingRoute ? 'bg-gray-400' : 'bg-gray-900 hover:bg-black active:scale-[0.98]'}`}
                                >
                                    {isCalculatingRoute ? <><SpinnerIcon /> CALCULATING...</> : '🔍 Calculate Safe Routes'}
                                </button>
                            </form>

                            {safeRideRoutes && (
                                <div className="mt-6 border-t border-gray-200 pt-6 animate-fade-in-up">
                                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Route Options</h3>
                                    
                                    <div className="flex flex-col gap-3 mb-5">
                                        {/* Card A: Fastest */}
                                        <div 
                                            onClick={() => setSelectedRoute('fastest')}
                                            className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedRoute === 'fastest' ? 'bg-red-50 border-red-500 shadow-md' : 'bg-white border-gray-200 hover:border-red-300'}`}
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <h4 className="font-black text-gray-900 flex items-center gap-1.5">
                                                    ⚡ Fastest Route
                                                </h4>
                                                <span className="text-sm font-black text-gray-900">{safeRideRoutes.fastest.eta}</span>
                                            </div>
                                            <div className="text-xs font-bold text-gray-500 mb-2">{safeRideRoutes.fastest.dist} • Mostly direct</div>
                                            <div className="text-[10px] uppercase font-black tracking-widest text-red-600 bg-red-100/50 px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1.5">
                                                {safeRideRoutes.fastest.tag}
                                            </div>
                                        </div>

                                        {/* Card B: Safe Corridor */}
                                        <div 
                                            onClick={() => setSelectedRoute('safe')}
                                            className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedRoute === 'safe' ? 'bg-cyan-50 border-cyan-500 shadow-md' : 'bg-white border-gray-200 hover:border-cyan-300'}`}
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <h4 className="font-black text-gray-900 flex items-center gap-1.5">
                                                    🛡️ Safe Corridor
                                                </h4>
                                                <span className="text-sm font-black text-emerald-600">{safeRideRoutes.safe.eta}</span>
                                            </div>
                                            <div className="text-xs font-bold text-gray-500 mb-2">{safeRideRoutes.safe.dist} • Hazard detour</div>
                                            <div className="text-[10px] uppercase font-black tracking-widest text-emerald-700 bg-emerald-100/50 px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1.5">
                                                {safeRideRoutes.safe.tag}
                                            </div>
                                        </div>
                                    </div>

                                    <button 
                                        onClick={handleStartSafeRide}
                                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-xl shadow-lg transition-all text-xs tracking-wider uppercase flex justify-center items-center gap-2 active:scale-[0.98]"
                                    >
                                        🚀 Start SafeRide
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Standard Dashboard Feed */
                        <div className="flex-1 flex flex-col overflow-hidden">
                            {/* Section 4: Safety Features & Quick Tools Panel */}
                            <div className="p-4 border-b border-gray-100 bg-slate-50 flex gap-2 shrink-0">
                                <button 
                                    onClick={() => { 
                                        if(requireAuth()) {
                                            setIsReporting(true); setSelectedHazard(null); if(locationSuccess) setFormLocation(userLocation); 
                                        }
                                    }}
                                    className="flex-1 bg-gray-900 text-white px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-black transition-colors shadow-sm"
                                >
                                    <span>🚨</span> Report Hazard
                                </button>
                                <button 
                                    onClick={() => fetchLocation(true, false, session?.city)}
                                    className="bg-white border border-gray-200 text-gray-700 px-4 py-3 rounded-xl font-bold text-xs flex items-center justify-center hover:bg-gray-50 transition-colors shadow-sm shrink-0"
                                    title="Locate My Area"
                                >
                                    {isLocating ? <SpinnerIcon /> : "🧭"}
                                </button>
                                <button 
                                    onClick={triggerEmergencyBroadcast}
                                    className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl font-bold text-xs flex items-center justify-center hover:bg-red-100 transition-colors shadow-sm shrink-0"
                                    title="Emergency Broadcast"
                                >
                                    🔔
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto">
                                {/* KPI Metric Cards */}
                                <div className="p-5 border-b border-gray-100 shrink-0">
                                    <div className="grid grid-cols-2 gap-3 mb-3">
                                        <div className="bg-slate-50 border border-gray-200 rounded-xl p-4">
                                            <span className="block text-[9px] uppercase tracking-widest font-black text-gray-500 mb-1">Active Hazards</span>
                                            <div className="flex items-end gap-2">
                                                <span className="text-2xl font-black text-gray-900 leading-none">{activeHazards.length}</span>
                                                <span className="text-xs font-bold text-green-500 mb-0.5">▲7</span>
                                            </div>
                                        </div>
                                        <div className="bg-slate-50 border border-gray-200 rounded-xl p-4">
                                            <span className="block text-[9px] uppercase tracking-widest font-black text-gray-500 mb-1">Resolved Reports</span>
                                            <div className="flex items-end gap-2">
                                                <span className="text-2xl font-black text-gray-900 leading-none">{resolvedCount}</span>
                                                <span className="text-xs font-bold text-green-500 mb-0.5">▲14</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex justify-between items-center mb-3">
                                        <span className="block text-[10px] uppercase tracking-widest font-black text-red-600">Critical / High Severity</span>
                                        <span className="text-xl font-black text-red-700">{activeHazards.filter(h => h.severity === 'High').length}</span>
                                    </div>

                                    {/* Emerging Cluster AI Warning Card */}
                                    {clusters.length > 0 && (
                                        <div className="bg-red-600 text-white rounded-xl p-4 shadow-[0_4px_15px_rgba(220,38,38,0.3)] animate-scale-in">
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <span className="animate-pulse">⚠️</span> 
                                                <span className="text-[10px] uppercase tracking-widest font-black">Emerging Cluster Detected</span>
                                            </div>
                                            <p className="text-xs font-medium text-red-100">
                                                {clusters[0].count} incidents concentrated in this sector. Urgency Multiplier: 2.1x
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Quick Severity Filter Tabs */}
                                <div className="px-5 pt-4 pb-2 shrink-0 border-b border-gray-100 sticky top-0 bg-white z-10">
                                    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
                                        {['All', 'High', 'Medium', 'Low'].map(level => (
                                            <button 
                                                key={level}
                                                onClick={() => setCurrentFilter(level)}
                                                className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors border ${
                                                    currentFilter === level 
                                                    ? 'bg-gray-900 text-white border-gray-900' 
                                                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                                }`}
                                            >
                                                {level === 'High' && '🔴 '}
                                                {level === 'Medium' && '🟡 '}
                                                {level === 'Low' && '🟢 '}
                                                {level}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Live Incident Feed */}
                                <div className="bg-slate-50/50 min-h-[300px]">
                                    {filteredHazards.length === 0 ? (
                                        <div className="p-8 text-center text-gray-400 font-bold text-sm">No incidents match this filter.</div>
                                    ) : (
                                        <div className="divide-y divide-gray-100">
                                            {[...filteredHazards].sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).map(h => (
                                                <div 
                                                    key={h.id} 
                                                    className={`p-5 bg-white hover:bg-slate-50 cursor-pointer transition-colors border-l-4 ${h.severity === 'High' ? 'border-l-red-500' : h.severity === 'Medium' ? 'border-l-amber-500' : 'border-l-green-500'}`}
                                                    onClick={() => { setMapFocusLocation({lat: h.latitude, lng: h.longitude}); setSelectedHazard(h); setMobileView('map'); }}
                                                >
                                                    <div className="flex justify-between items-start mb-2">
                                                        <h4 className="font-black text-gray-900 text-sm truncate pr-2 flex items-center gap-1.5">
                                                            {h.category} 
                                                            {h.is_ai_verified && <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded uppercase tracking-wider">✨ AI</span>}
                                                        </h4>
                                                        <span className="text-[10px] text-gray-400 font-black tracking-wider uppercase shrink-0 mt-0.5">{timeAgo(h.created_at)}</span>
                                                    </div>
                                                    <p className="text-xs text-gray-600 font-medium mb-3 line-clamp-2">"{h.description}"</p>
                                                    <div className="flex justify-between items-center text-[10px] uppercase font-bold text-gray-500">
                                                        <div className="flex items-center gap-1.5">
                                                            <div className="bg-gray-100 rounded-full w-5 h-5 flex items-center justify-center text-[8px] font-black text-gray-800">{h.reporter_name.charAt(0)}</div>
                                                            <span className="truncate max-w-[100px] text-gray-800 font-extrabold">{h.reporter_name}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="bg-blue-50 text-blue-600 px-2.5 py-1 rounded-md">{h.confirmations} 👍</span>
                                                            <span className="bg-rose-50 text-rose-600 px-2.5 py-1 rounded-md">{h.appreciation_count || 0} ❤️</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </aside>

                {/* RIGHT COLUMN: Dedicated Map Container */}
                <main className={`flex-1 relative bg-slate-100 ${mobileView === 'dashboard' ? 'hidden md:block' : 'block'}`}>
                    
                    {/* Floating Base Layer Switcher */}
                    <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-50 glass-panel rounded-full p-1.5 flex gap-1 shadow-2xl border border-white/40">
                        <button 
                            onClick={() => setActiveMapLayer('satellite')}
                            className={`px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 transition-all ${activeMapLayer === 'satellite' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-600 hover:bg-white/50'}`}
                        >
                            🛰️ Satellite
                        </button>
                        <button 
                            onClick={() => setActiveMapLayer('dark')}
                            className={`px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 transition-all ${activeMapLayer === 'dark' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-600 hover:bg-white/50'}`}
                        >
                            🌑 Dark
                        </button>
                        <button 
                            onClick={() => setActiveMapLayer('streets')}
                            className={`px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 transition-all ${activeMapLayer === 'streets' ? 'bg-blue-500 text-white shadow-lg' : 'text-slate-600 hover:bg-white/50'}`}
                        >
                            🗺️ Streets
                        </button>
                    </div>

                    <LeafletMap 
                        center={userLocation} 
                        hazards={currentFilter === 'All' ? activeHazards : activeHazards.filter(h => h.category === currentFilter)}
                        onMarkerClick={(hazard) => setSelectedHazard(hazard)}
                        isSelectingLocation={isSelectingLocation}
                        onLocationSelect={handleMapSelect}
                        mapFocusLocation={mapFocusLocation}
                        formLocation={formLocation}
                        isReporting={isReporting}
                        clusters={clusters}
                        safeRideRoutes={safeRideRoutes}
                        selectedRoute={selectedRoute}
                        activeMapLayer={activeMapLayer}
                    />

                    {/* Hazard Details Popup Card */}
                    {selectedHazard && !isActiveTrip && (
                        <div className="absolute z-[1000] bottom-20 md:bottom-6 left-4 right-4 md:left-[auto] md:right-6 md:w-[420px] bg-white rounded-2xl shadow-2xl overflow-hidden animate-scale-in border border-gray-100">
                            <div className={`h-2 w-full ${selectedHazard.severity === 'High' ? 'bg-red-500' : selectedHazard.severity === 'Medium' ? 'bg-amber-500' : 'bg-green-500'}`}></div>
                            
                            <div className="p-5">
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <h2 className="text-lg font-black text-gray-900 leading-tight mb-1 flex items-center gap-1.5">
                                            {selectedHazard.category}
                                        </h2>
                                        <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">{timeAgo(selectedHazard.created_at)}</span>
                                    </div>
                                    <button onClick={() => setSelectedHazard(null)} className="text-gray-400 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 rounded-full p-2 transition-colors shrink-0">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                    </button>
                                </div>
                                
                                {selectedHazard.is_ai_verified && (
                                    <div className="mb-4 bg-indigo-50 border border-indigo-100 p-3 rounded-xl flex gap-3">
                                        <span className="text-indigo-500 mt-0.5">✨</span>
                                        <div>
                                            <span className="block text-[9px] uppercase tracking-widest font-black text-indigo-400 mb-0.5">AI Safety Advisory</span>
                                            <p className="text-xs font-bold text-indigo-900">{selectedHazard.ai_advisory}</p>
                                        </div>
                                    </div>
                                )}

                                <p className="text-gray-600 mb-5 text-sm font-medium leading-relaxed bg-slate-50 p-3 rounded-xl border border-gray-100">"{selectedHazard.description}"</p>
                                
                                {/* Reporter & Appreciation */}
                                <div className="flex items-center justify-between mb-5 relative">
                                    {showAppreciationToast && (
                                        <div className="absolute -top-10 left-0 bg-rose-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-full shadow-lg animate-fade-in-up z-50 flex items-center gap-1.5">
                                            ❤️ You appreciated {selectedHazard.reporter_name}'s report!
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center font-bold text-xs">
                                            {selectedHazard.reporter_name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[9px] uppercase tracking-widest text-gray-400 font-bold">Reported By</span>
                                            <span className="text-sm font-black text-gray-900">{selectedHazard.reporter_name}</span>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => appreciateReporter(selectedHazard)}
                                        className="text-xs bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-colors border border-rose-200 active:scale-95"
                                        title="Appreciate Reporter"
                                    >
                                        👏 {selectedHazard.appreciation_count || 0} Thanks
                                    </button>
                                </div>

                                {/* Action Buttons */}
                                {selectedHazard.status === 'active' ? (
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => confirmHazard(selectedHazard)}
                                            className="flex-[1] bg-gray-100 hover:bg-gray-200 text-gray-800 font-black text-xs tracking-wide py-3 rounded-xl transition-all active:scale-95 flex justify-center items-center gap-2"
                                        >
                                            👍 Confirm ({selectedHazard.confirmations})
                                        </button>
                                        <button 
                                            onClick={() => markResolved(selectedHazard)}
                                            className="flex-[1] bg-green-500 hover:bg-green-600 text-white font-black text-xs tracking-wide py-3 rounded-xl shadow-sm transition-all active:scale-95 flex justify-center items-center gap-1.5"
                                        >
                                            ✅ Mark Resolved
                                        </button>
                                    </div>
                                ) : (
                                    <div className="w-full bg-gray-100 text-gray-500 font-black text-xs tracking-wide py-3 rounded-xl flex justify-center items-center gap-1.5 uppercase">
                                        ✅ Resolved
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </main>

                {/* Mobile Bottom Navigation Toggle */}
                <div className="md:hidden absolute bottom-0 left-0 right-0 h-16 bg-white border-t border-gray-200 flex z-50 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] pb-safe">
                    <button 
                        onClick={() => setMobileView('dashboard')} 
                        className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${mobileView === 'dashboard' ? 'text-gray-900' : 'text-gray-400'}`}
                    >
                        <ChartIcon />
                        <span className="text-[10px] font-black uppercase tracking-widest">Dashboard</span>
                    </button>
                    <button 
                        onClick={() => setMobileView('map')} 
                        className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${mobileView === 'map' ? 'text-blue-600' : 'text-gray-400'}`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon><line x1="9" y1="3" x2="9" y2="18"></line><line x1="15" y1="6" x2="15" y2="21"></line></svg>
                        <span className="text-[10px] font-black uppercase tracking-widest">Map</span>
                    </button>
                </div>
            </div>

            {/* Toasts Container */}
            <div className="fixed top-24 left-1/2 transform -translate-x-1/2 md:left-auto md:translate-x-0 md:right-5 z-[2100] flex flex-col gap-3 pointer-events-none w-[90%] md:w-auto">
                {toasts.map(toast => (
                    <div key={toast.id} className={`animate-scale-in px-5 py-3.5 rounded-2xl shadow-lg border text-sm font-semibold flex items-center gap-3 bg-white ${
                        toast.type === 'error' ? 'border-red-200 text-red-800' : 'border-green-200 text-green-800'
                    }`}>
                        <span className="text-lg">{toast.type === 'error' ? '⚠️' : '✅'}</span> {toast.message}
                    </div>
                ))}
            </div>

            {/* User Profile Full Drawer / Modal */}
            {isProfileModalOpen && session && (
                <div className="fixed inset-0 z-[4000] flex justify-end bg-gray-900/60 backdrop-blur-sm p-0 md:p-4 animate-fade-in">
                    <div className="bg-white/95 glass-modal w-full md:w-[480px] h-full md:h-auto md:max-h-[90vh] md:rounded-3xl shadow-2xl border-l md:border border-white/50 overflow-hidden flex flex-col relative animate-slide-in-right">
                        
                        {/* Header Section */}
                        <div className="p-6 pb-4 border-b border-gray-200 bg-gray-50/80 sticky top-0 z-10">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex gap-4 items-center">
                                    <div className="w-16 h-16 rounded-full border-4 border-white shadow-md bg-blue-600 text-white flex items-center justify-center font-black text-2xl">
                                        {session.full_name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-black text-gray-900 leading-tight flex items-center gap-1.5 uppercase tracking-tight">
                                            {session.full_name}
                                        </h2>
                                        <span className="text-[10px] text-green-600 font-black uppercase flex items-center gap-1 mt-0.5 tracking-widest"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Verified Citizen</span>
                                        <p className="text-xs text-gray-500 font-bold mt-1">{session.email || session.phone}</p>
                                    </div>
                                </div>
                                <button onClick={() => setIsProfileModalOpen(false)} className="text-gray-400 hover:text-gray-900 bg-white border border-gray-200 rounded-full p-1.5 transition-colors shadow-sm">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </button>
                            </div>
                            <div className="flex items-center justify-between text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm">
                                <span className="flex items-center gap-1.5"><span className="text-lg">📍</span> {session.city}</span>
                                <span className="text-blue-600 flex items-center gap-1.5">🏅 {profileData.rank}</span>
                            </div>
                        </div>

                        {/* Scrollable Body */}
                        <div className="flex-1 overflow-y-auto bg-slate-50">
                            {/* KPI Metrics */}
                            <div className="p-6 pb-2">
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Community Impact</h3>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="bg-white border border-gray-200 rounded-xl p-3 flex flex-col items-center justify-center text-center shadow-sm">
                                        <span className="text-2xl mb-1">🚨</span>
                                        <span className="text-xl font-black text-gray-900 leading-none mb-1">{profileData.reportedCount}</span>
                                        <span className="text-[9px] uppercase tracking-widest font-bold text-gray-500">Reported</span>
                                    </div>
                                    <div className="bg-white border border-gray-200 rounded-xl p-3 flex flex-col items-center justify-center text-center shadow-sm">
                                        <span className="text-2xl mb-1">👏</span>
                                        <span className="text-xl font-black text-gray-900 leading-none mb-1">{profileData.appreciationCount}</span>
                                        <span className="text-[9px] uppercase tracking-widest font-bold text-gray-500">Appreciation</span>
                                    </div>
                                    <div className="bg-white border border-green-200 rounded-xl p-3 flex flex-col items-center justify-center text-center shadow-sm">
                                        <span className="text-2xl mb-1">✅</span>
                                        <span className="text-xl font-black text-green-600 leading-none mb-1">{profileData.resolvedCount}</span>
                                        <span className="text-[9px] uppercase tracking-widest font-bold text-green-600">Resolved</span>
                                    </div>
                                </div>
                            </div>

                            {/* Activity Feed */}
                            <div className="p-6">
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">My Reported Hazards</h3>
                                {profileData.userHazards.length === 0 ? (
                                    <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 font-bold text-sm shadow-sm">
                                        You haven't reported any hazards yet.
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-3">
                                        {profileData.userHazards.map(h => (
                                            <div key={h.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col gap-3">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h4 className="font-black text-gray-900 text-sm flex items-center gap-1.5">
                                                            {h.category} 
                                                        </h4>
                                                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{timeAgo(h.created_at)}</span>
                                                    </div>
                                                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md ${
                                                        h.status === 'resolved' ? 'bg-green-100 text-green-700' : 
                                                        h.severity === 'High' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                                                    }`}>
                                                        {h.status === 'resolved' ? 'Resolved' : 'Active'}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-gray-600 font-medium line-clamp-2">"{h.description}"</p>
                                                <div className="flex justify-between items-center mt-1">
                                                    <div className="flex gap-2">
                                                        <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded">👍 {h.confirmations}</span>
                                                        <span className="text-[10px] font-bold text-rose-500 bg-rose-50 px-2 py-1 rounded">❤️ {h.appreciation_count || 0}</span>
                                                    </div>
                                                    <button 
                                                        onClick={() => {
                                                            setMapFocusLocation({lat: h.latitude, lng: h.longitude});
                                                            setSelectedHazard(h);
                                                            setIsProfileModalOpen(false);
                                                            setMobileView('map');
                                                        }}
                                                        className="text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1"
                                                    >
                                                        Locate <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 16 16 12 12 8"></polyline><line x1="8" y1="12" x2="16" y2="12"></line></svg>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Auth Modal */}
            {authView && (
                <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white/95 glass-modal w-full max-w-sm rounded-3xl shadow-2xl border border-white/50 overflow-hidden animate-scale-in relative flex flex-col">
                        <button onClick={() => setAuthView(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-full p-1.5 transition-colors z-10">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                        
                        {/* Auth Tabs */}
                        {authView !== 'otp' && (
                            <div className="px-8 pt-8 pb-4">
                                <div className="flex bg-gray-100 p-1 rounded-xl shadow-inner border border-gray-200 w-full mb-2">
                                    <button
                                        onClick={() => setAuthMethod('email')}
                                        className={`flex-1 py-2 rounded-lg text-xs font-black transition-all duration-200 ${authMethod === 'email' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
                                    >
                                        ✉️ Email
                                    </button>
                                    <button
                                        onClick={() => setAuthMethod('phone')}
                                        className={`flex-1 py-2 rounded-lg text-xs font-black transition-all duration-200 ${authMethod === 'phone' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
                                    >
                                        📱 Phone
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className={`px-8 pb-8 ${authView === 'otp' ? 'pt-8' : ''}`}>
                            {authView === 'otp' && (
                                <div className="flex justify-center mb-6">
                                    <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white p-3 rounded-2xl shadow-sm">
                                        <ShieldIcon />
                                    </div>
                                </div>
                            )}

                            <h2 className="text-xl font-black text-center text-gray-900 uppercase tracking-tight mb-6">
                                {authView === 'login' ? 'Welcome Back' : authView === 'signup' ? 'Join Community' : 'Verify Identity'}
                            </h2>

                            {/* Dev OTP Banner */}
                            {authView === 'otp' && generatedOtp && (
                                <div className="mb-6 bg-gradient-to-r from-indigo-500 to-purple-600 p-4 rounded-xl shadow-lg border border-indigo-400 text-white animate-fade-in-up">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-lg">📬</span>
                                        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-100">Dev / Demo OTP Code</span>
                                    </div>
                                    <div className="text-2xl font-black tracking-[0.25em] text-center my-2 bg-black/20 rounded-lg py-2 backdrop-blur-sm">
                                        {generatedOtp}
                                    </div>
                                    <p className="text-[9px] font-medium text-indigo-100 text-center leading-tight">
                                        (In production, this code is securely dispatched to your device via SMS or Email)
                                    </p>
                                </div>
                            )}

                            <form onSubmit={handleAuthSubmit} className="flex flex-col gap-4">
                                {authView === 'signup' && (
                                    <>
                                        <input type="text" placeholder="Full Name" required value={authForm.full_name} onChange={(e) => setAuthForm({...authForm, full_name: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none" />
                                        <input type="text" placeholder="City" required value={authForm.city} onChange={(e) => setAuthForm({...authForm, city: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none" />
                                    </>
                                )}
                                
                                {authView !== 'otp' && authMethod === 'email' && (
                                    <input type="email" placeholder="Email Address" required value={authForm.email} onChange={(e) => setAuthForm({...authForm, email: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none" />
                                )}

                                {authView !== 'otp' && authMethod === 'phone' && (
                                    <div className="flex gap-2">
                                        <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-sm font-black text-gray-500 flex items-center justify-center shrink-0 w-16">
                                            +91
                                        </div>
                                        <input type="tel" placeholder="10-digit mobile number" required value={authForm.phone} onChange={(e) => setAuthForm({...authForm, phone: e.target.value})} className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none tracking-wider" maxLength="10" />
                                    </div>
                                )}

                                {authView !== 'otp' && (!isOtpLogin || authMethod === 'email') && (
                                    <input type="password" placeholder="Password" required value={authForm.password} onChange={(e) => setAuthForm({...authForm, password: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none" />
                                )}

                                {authView === 'otp' && (
                                    <div className="text-center">
                                        <p className="text-xs text-gray-500 font-bold mb-4">Enter the 6-digit code to continue.</p>
                                        <input type="text" placeholder="••••••" required maxLength="6" value={authForm.otp} onChange={(e) => setAuthForm({...authForm, otp: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-center text-xl tracking-[0.5em] font-black focus:ring-2 focus:ring-blue-500 outline-none uppercase" />
                                    </div>
                                )}

                                <button type="submit" disabled={isAuthenticating} className={`w-full text-white font-black py-3.5 rounded-xl shadow-md transition-all text-sm tracking-wide uppercase mt-2 flex justify-center items-center gap-2 ${isAuthenticating ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.98]'}`}>
                                    {isAuthenticating ? <SpinnerIcon /> : authView === 'login' ? (isOtpLogin && authMethod === 'phone' ? 'Send OTP Login' : 'Sign In') : authView === 'signup' ? 'Create Account' : 'Verify Code'}
                                </button>
                            </form>
                            
                            {authView !== 'otp' && authView === 'login' && authMethod === 'phone' && (
                                <div className="mt-4 text-center">
                                    <button 
                                        type="button"
                                        onClick={() => setIsOtpLogin(!isOtpLogin)}
                                        className="text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-800 transition-colors bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-lg"
                                    >
                                        {isOtpLogin ? 'Use Password Instead' : 'Login via OTP SMS Instead'}
                                    </button>
                                </div>
                            )}

                            {authView !== 'otp' && (
                                <div className="mt-6 text-center text-xs font-bold text-gray-500 border-t border-gray-100 pt-5">
                                    {authView === 'login' ? "Don't have an account? " : "Already verified? "}
                                    <button onClick={() => setAuthView(authView === 'login' ? 'signup' : 'login')} className="text-blue-600 hover:underline uppercase tracking-wider">
                                        {authView === 'login' ? 'Register Now' : 'Log In'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Report Form Modal */}
            {isReporting && (
                <div className="fixed inset-0 z-[3000] flex items-end sm:items-center justify-center bg-gray-900/60 backdrop-blur-sm animate-fade-in sm:p-4 pointer-events-none">
                    <div className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] sm:animate-scale-in border border-gray-100 pointer-events-auto">
                        <div className="px-6 py-5 flex justify-between items-center bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                            <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight">Report a Hazard</h2>
                            <button onClick={() => { setIsReporting(false); setIsSelectingLocation(false); setFormLocation(null); setLandmarkName(''); }} className="text-gray-400 hover:text-gray-900 bg-white border border-gray-200 rounded-full p-2 transition-colors shadow-sm">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
                        
                        <form onSubmit={submitReport} className="px-6 pb-6 pt-5 overflow-y-auto">
                            <div className="mb-4">
                                <div className="flex justify-between items-end mb-2">
                                    <label className="block text-[10px] font-extrabold text-gray-500 uppercase tracking-widest">Description</label>
                                    <button 
                                        type="button" 
                                        onClick={analyzeHazardText}
                                        className="text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1 active:scale-95"
                                    >
                                        ✨ AI Auto-Classify
                                    </button>
                                </div>
                                <textarea 
                                    required
                                    value={description} 
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Briefly describe the hazard..."
                                    className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all min-h-[80px] resize-none bg-gray-50 text-gray-900 font-medium text-sm placeholder-gray-400 shadow-sm"
                                />
                            </div>

                            {isAiVerified && (
                                <div className="mb-4 bg-indigo-50 border border-indigo-100 p-3 rounded-xl flex gap-3 animate-fade-in-up">
                                    <span className="text-indigo-500 mt-0.5">✨</span>
                                    <div>
                                        <span className="block text-[9px] uppercase tracking-widest font-black text-indigo-400 mb-0.5">AI Safety Advisory</span>
                                        <p className="text-xs font-bold text-indigo-900">{aiAdvisory}</p>
                                    </div>
                                </div>
                            )}

                            <div className="mb-4 flex gap-3">
                                <div className="flex-1">
                                    <label className="block text-[10px] font-extrabold text-gray-500 uppercase tracking-widest mb-2">Category</label>
                                    <select 
                                        value={category} 
                                        onChange={(e) => setCategory(e.target.value)}
                                        className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-gray-50 text-gray-900 font-bold text-sm appearance-none shadow-sm"
                                        style={{ backgroundImage: `url('data:image/svg+xml;charset=US-ASCII,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="%236b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>')`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1.2em' }}
                                    >
                                        <option>Dangerous Condition</option>
                                        <option>Road Hazard</option>
                                        <option>Broken Streetlight</option>
                                        <option>Unsafe Crossing</option>
                                        <option>Flooding</option>
                                        <option>Civic Maintenance</option>
                                        <option>Other</option>
                                    </select>
                                </div>
                                <div className="flex-1">
                                    <label className="block text-[10px] font-extrabold text-gray-500 uppercase tracking-widest mb-2">Severity</label>
                                    <select 
                                        value={severity} 
                                        onChange={(e) => setSeverity(e.target.value)}
                                        className={`w-full border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm font-black appearance-none shadow-sm ${
                                            severity === 'High' ? 'bg-red-50 text-red-700 border-red-200' : 
                                            severity === 'Medium' ? 'bg-amber-50 text-amber-700 border-amber-200' : 
                                            'bg-green-50 text-green-700 border-green-200'
                                        }`}
                                        style={{ backgroundImage: `url('data:image/svg+xml;charset=US-ASCII,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="%236b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>')`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1.2em' }}
                                    >
                                        <option value="Low">Low</option>
                                        <option value="Medium">Medium</option>
                                        <option value="High">High</option>
                                    </select>
                                </div>
                            </div>

                            <div className="mb-6">
                                <label className="block text-[10px] font-extrabold text-gray-500 uppercase tracking-widest mb-2">Pinpoint Location</label>
                                
                                {/* Location Status Badge */}
                                {locationSuccess && formLocation ? (
                                    <div className="mb-3 bg-green-50 border border-green-200 rounded-xl p-3 flex items-start gap-3 shadow-sm animate-fade-in">
                                        <span className="text-xl mt-0.5">📍</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-center mb-0.5">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-green-700 flex items-center gap-1">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                                    Location Set
                                                </span>
                                                <span className="text-[9px] font-bold text-green-600 font-mono bg-green-100 px-1.5 py-0.5 rounded">{formLocation.lat.toFixed(4)}, {formLocation.lng.toFixed(4)}</span>
                                            </div>
                                            <p className="text-xs font-bold text-gray-800 truncate">
                                                {isReverseGeocoding ? <span className="flex items-center gap-1 text-gray-400"><SpinnerIcon /> Locating...</span> : landmarkName || 'Unknown Location'}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mb-3 bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-center shadow-sm">
                                        <span className="text-xs font-black text-red-600 uppercase tracking-widest flex items-center gap-2">
                                            <span className="text-lg">⚠️</span> Location Required
                                        </span>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <button 
                                        type="button"
                                        onClick={() => { setIsReporting(false); setIsSelectingLocation(true); setLocationSuccess(false); setMobileView('map'); }}
                                        className="w-full py-3 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 border bg-gray-900 text-white hover:bg-black shadow-sm active:scale-[0.98]"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>
                                        Pick Location on Map
                                    </button>
                                </div>

                                {/* Quick Select Chips */}
                                <div className="mt-3">
                                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">Quick Select:</p>
                                    <div className="flex flex-wrap gap-2">
                                        <button 
                                            type="button"
                                            onClick={() => fetchLocation(false, true)}
                                            className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg transition-colors border border-gray-200 flex items-center gap-1.5"
                                        >
                                            {isLocating ? <SpinnerIcon /> : '🎯 Current GPS'}
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => {
                                                const loc = FALLBACK_CITIES['Ambala'];
                                                setFormLocation(loc);
                                                setMapFocusLocation(loc);
                                                setLocationSuccess(true);
                                                reverseGeocode(loc.lat, loc.lng);
                                            }}
                                            className="bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg transition-colors border border-blue-200"
                                        >
                                            📍 Ambala Cantt
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => {
                                                const loc = { lat: 30.3782, lng: 76.7767 };
                                                setFormLocation(loc);
                                                setMapFocusLocation(loc);
                                                setLocationSuccess(true);
                                                reverseGeocode(loc.lat, loc.lng);
                                            }}
                                            className="bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg transition-colors border border-blue-200"
                                        >
                                            📍 Ambala City
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <button 
                                type="submit" 
                                disabled={isSubmitting || !locationSuccess}
                                className={`w-full text-white font-black py-4 rounded-xl shadow-md transition-all text-sm tracking-wide flex justify-center items-center gap-2 uppercase mt-6 ${isSubmitting || !locationSuccess ? 'bg-gray-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 active:scale-[0.98]'}`}
                            >
                                {isSubmitting ? <><SpinnerIcon /> SUBMITTING...</> : 'SUBMIT REPORT'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
            
            {/* Map Click Instructions */}
            {isSelectingLocation && (
                <div className="fixed top-24 left-1/2 transform -translate-x-1/2 z-[2000] bg-gray-900/90 backdrop-blur-md text-white rounded-full px-6 py-3 shadow-2xl animate-fade-in-up border border-gray-700 flex flex-col items-center pointer-events-none">
                    <span className="font-black text-sm flex items-center gap-2 tracking-wide uppercase">
                        👆 Click anywhere to drop pin
                    </span>
                    <span className="text-[10px] font-medium text-gray-400 mt-1">
                        (You can drag the pin after dropping)
                    </span>
                </div>
            )}
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);

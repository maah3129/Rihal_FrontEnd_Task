import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = process.env.REACT_APP_MAP_TOKEN;


const crimeTypeColors = {
  assault: "#FF5733",
  robbery: "#33A1FF",
  homicide: "#C70039",
  kidnapping: "#FFC300",
  theft: "#28B463",
};

const MapboxCrimeMap = () => {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerRefs = useRef([]);
  const selectionMarkerRef = useRef(null);

  // Data and filter state
  const [crimeReports, setCrimeReports] = useState([]);
  const [filters, setFilters] = useState({
    assault: true,
    robbery: true,
    homicide: true,
    kidnapping: true,
    theft: true,
  });

  // Theme state
  const [theme, setTheme] = useState("dark");
  const isDark = theme === "dark";

  // Multi-step Report Form states
  const [showForm, setShowForm] = useState(false);
  const [selectingLocation, setSelectingLocation] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [formStep, setFormStep] = useState(1);
  const [formData, setFormData] = useState({
    report_details: "",
    crime_type: "Assault",
    national_id: "",
    latitude: "",
    longitude: "",
  });

  // Simple search bar (searches across crime type, date, and national id)
  const [searchTerm, setSearchTerm] = useState("");

  const filteredAndSearchedReports = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return crimeReports.filter(report => {
      const typeMatch = filters[report.crime_type.toLowerCase()];
      const searchMatch =
        !searchTerm ||
        (report.crime_type && report.crime_type.toLowerCase().includes(term)) ||
        (report.national_id && report.national_id.toString().includes(term)) ||
        (report.report_date_time && report.report_date_time.includes(term)) ||
        (report.report_details && report.report_details.toLowerCase().includes(term));
      return typeMatch && searchMatch;
    });
  }, [crimeReports, filters, searchTerm]);

  const updateMarkers = useCallback(() => {
    if (!mapInstance.current || !mapInstance.current.isStyleLoaded()) {
      mapInstance.current &&
        mapInstance.current.once("load", () => updateMarkers());
      return;
    }
    markerRefs.current.forEach((marker) => marker.remove());
    markerRefs.current = [];
    filteredAndSearchedReports.forEach((report) => {
      const type = (report.crime_type || "").toLowerCase();
      const el = document.createElement("div");
      el.className = "crime-marker";
      el.style.width = "20px";
      el.style.height = "20px";
      el.style.backgroundColor = crimeTypeColors[type] || "#000";
      el.style.borderRadius = "50%";
      el.style.cursor = "pointer";
      if ((report.report_status || "").toLowerCase() === "pending") {
        el.style.animation = "blink 1s infinite";
      }
      const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
        <div style="font-size: 14px; color: black;">
          <strong>Type:</strong> ${report.crime_type}<br />
          <strong>Date:</strong> ${report.report_date_time}<br />
          <strong>Status:</strong> ${report.report_status}<br />
          <strong>Details:</strong> ${report.report_details}
        </div>
      `);
      const marker = new mapboxgl.Marker(el)
        .setLngLat([report.longitude, report.latitude])
        .setPopup(popup)
        .addTo(mapInstance.current);
      markerRefs.current.push(marker);
    });
  }, [filteredAndSearchedReports]);

  useEffect(() => {
    // Initialize Mapbox map
    mapInstance.current = new mapboxgl.Map({
      container: mapRef.current,
      style: isDark
        ? "mapbox://styles/mapbox/traffic-night-v2"
        : "mapbox://styles/mapbox/streets-v11",
      center: [58.4059, 23.5859],
      zoom: 12,
    });
    mapInstance.current.addControl(new mapboxgl.NavigationControl());
    mapInstance.current.on("load", () => updateMarkers());
    mapInstance.current.on("click", (e) => {
      if (!selectingLocation) return;
      const { lng, lat } = e.lngLat;
      if (selectionMarkerRef.current) selectionMarkerRef.current.remove();
      const el = document.createElement("div");
      el.style.width = "20px";
      el.style.height = "20px";
      el.style.borderRadius = "50%";
      el.style.backgroundColor = "white";
      el.style.border = "3px solid red";
      const marker = new mapboxgl.Marker(el).setLngLat([lng, lat]).addTo(mapInstance.current);
      selectionMarkerRef.current = marker;
      setSelectedLocation({ lng: lng.toFixed(6), lat: lat.toFixed(6) });
    });
    return () => mapInstance.current && mapInstance.current.remove();
  }, [updateMarkers, selectingLocation, isDark]);

  // Load data from JSON and merge with persisted new reports
  useEffect(() => {
    const loadReports = async () => {
      try {
        const res = await fetch(process.env.PUBLIC_URL + "/data.json");
        const data = await res.json();
        let baseReports = Array.isArray(data.crimes) ? data.crimes : [];
        const storedNew = localStorage.getItem("newReports");
        if (storedNew) {
          const newReports = JSON.parse(storedNew);
          baseReports = [...baseReports, ...newReports];
        }
        setCrimeReports(baseReports);
      } catch (err) {
        console.error("Failed to fetch data", err);
      }
    };
    loadReports();
  }, []);

  useEffect(() => {
    if (mapInstance.current?.isStyleLoaded()) {
      updateMarkers();
    }
  }, [updateMarkers]);

  const handleFilterChange = (type) =>
    setFilters((prev) => ({ ...prev, [type]: !prev[type] }));
  const handleFormChange = (e) =>
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  const handleSearchChange = (e) => setSearchTerm(e.target.value);

  const handleLocationConfirm = () => {
    if (selectedLocation) {
      setFormData((prev) => ({
        ...prev,
        latitude: selectedLocation.lat,
        longitude: selectedLocation.lng,
      }));
      setSelectingLocation(false);
    }
  };

  // --- Multi-step Form Navigation ---
  const handleNextStep = () => {
    if (formStep === 1) {
      if (!formData.national_id || !/^\d+$/.test(formData.national_id)) {
        alert("Please provide a valid National ID (digits only).");
        return;
      }
    } else if (formStep === 2) {
      if (!formData.report_details.trim()) {
        alert("Please provide report details.");
        return;
      }
    }
    setFormStep((prev) => prev + 1);
  };

  const handlePrevStep = () => setFormStep((prev) => prev - 1);

  const handleFormSubmit = (e) => {
    e.preventDefault();
    const { report_details, crime_type, national_id, latitude, longitude } = formData;
    if (!report_details || !crime_type || !national_id || !latitude || !longitude)
      return alert("Please fill in all fields.");
    if (isNaN(latitude) || isNaN(longitude))
      return alert("Latitude and Longitude must be valid numbers.");
    if (!/^\d+$/.test(national_id))
      return alert("National ID must be a number.");
    const pad = (num) => num.toString().padStart(2, "0");
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}`;

    const newReport = {
      id: crimeReports.length + 1,
      report_details,
      crime_type,
      national_id,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      report_status: "Pending",
      report_date_time: timestamp,
    };
    setCrimeReports((prev) => {
      const updatedReports = [...prev, newReport];
      // Persist new reports in local storage so they survive a refresh
      const storedNew = localStorage.getItem("newReports");
      const newReports = storedNew ? JSON.parse(storedNew) : [];
      newReports.push(newReport);
      localStorage.setItem("newReports", JSON.stringify(newReports));
      return updatedReports;
    });
    setShowForm(false);
    setFormStep(1);
    setFormData({
      report_details: "",
      crime_type: "Assault",
      national_id: "",
      latitude: "",
      longitude: "",
    });
    if (selectionMarkerRef.current) selectionMarkerRef.current.remove();
    selectionMarkerRef.current = null;
    setSelectedLocation(null);
  };

  // --- Render wizard steps (designed per your provided image) ---
  const renderWizardStep = () => {
    switch (formStep) {
      case 1:
        return (
          <div>
            <h3 style={{ marginBottom: "10px" }}>Step 1: Basic Info</h3>
            <label style={{ display: "block", marginBottom: "6px" }}>Crime Type:</label>
            <select
              name="crime_type"
              value={formData.crime_type}
              onChange={handleFormChange}
              style={styles.input}
            >
              <option>Assault</option>
              <option>Robbery</option>
              <option>Homicide</option>
              <option>Kidnapping</option>
              <option>Theft</option>
            </select>
            <label style={{ display: "block", margin: "10px 0 6px" }}>National ID:</label>
            <input
              type="number"
              name="national_id"
              value={formData.national_id}
              onChange={handleFormChange}
              style={styles.input}
              placeholder="e.g. 123456789"
            />
          </div>
        );
      case 2:
        return (
          <div>
            <h3 style={{ marginBottom: "10px" }}>Step 2: Report Details</h3>
            <label style={{ display: "block", marginBottom: "6px" }}>Report Details:</label>
            <textarea
              name="report_details"
              value={formData.report_details}
              onChange={handleFormChange}
              style={{ ...styles.input, height: "100px" }}
              placeholder="Describe the incident..."
            />
          </div>
        );
      case 3:
        return (
          <div>
            <h3 style={{ marginBottom: "10px" }}>Step 3: Location</h3>
            <div style={{ marginBottom: "10px" }}>
              <button
                type="button"
                onClick={() => setSelectingLocation(true)}
                style={{ ...styles.button, backgroundColor: "green", color: "white", marginRight: "10px" }}
              >
                Select on Map
              </button>
              <span style={{ fontSize: "0.9em" }}>(Click anywhere on the map)</span>
            </div>
            <label style={{ display: "block", marginBottom: "6px" }}>Latitude:</label>
            <input
              name="latitude"
              value={formData.latitude}
              onChange={handleFormChange}
              style={styles.input}
            />
            <label style={{ display: "block", margin: "10px 0 6px" }}>Longitude:</label>
            <input
              name="longitude"
              value={formData.longitude}
              onChange={handleFormChange}
              style={styles.input}
            />
          </div>
        );
      default:
        return null;
    }
  };

  const totalSteps = 3;
  const stepsArray = [1, 2, 3];

  return (
    <div style={{ backgroundColor: isDark ? "#081824" : "#F9F9F9", color: isDark ? "#fff" : "#000", minHeight: "100vh", fontFamily: "Arial, sans-serif" }}>
      <style>{`
        @keyframes blink { 0% { opacity: 1; } 50% { opacity: 0; } 100% { opacity: 1; } }
        button:hover { filter: brightness(1.1); }
      `}</style>
      <div style={{ padding: "10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Crime Reporting System</h2>
        <div style={{ display: "flex", alignItems: "center" }}>
          {/* Simple Search Bar */}
          <div style={{ display: "flex", alignItems: "center", marginRight: "10px", backgroundColor: isDark ? "#132c44" : "#e0e0d1", padding: "8px 15px", borderRadius: "8px" }}>
            <input
              type="text"
              placeholder="Search crimes..."
              value={searchTerm}
              onChange={handleSearchChange}
              style={{ padding: "5px", borderRadius: "4px", border: "1px solid #ccc", width: "300px" }}
            />
          </div>
          {/* Filters */}
          <div style={{ backgroundColor: isDark ? "#132c44" : "#e0e0d1", padding: "8px 15px", borderRadius: "8px", marginRight: "10px" }}>
            <strong>Filter:</strong>
            {Object.keys(filters).map((key) => (
              <label key={key} style={{ marginLeft: "10px" }}>
                <input type="checkbox" checked={filters[key]} onChange={() => handleFilterChange(key)} />{" "}
                {key.charAt(0).toUpperCase() + key.slice(1)}
              </label>
            ))}
          </div>
          {/* Theme & Report Buttons */}
          <button onClick={() => setTheme(isDark ? "light" : "dark")} style={{ ...buttonStyle, backgroundColor: isDark ? "#F9F9F9" : "#121212", color: isDark ? "#000" : "#fff" }}>
            {isDark ? "Light Mode 🔆" : "Dark Mode 🌙"}
          </button>
          <button onClick={() => { setShowForm(true); setFormStep(1); }} style={{ ...buttonStyle, backgroundColor: "#ffffff", color: "#000000", boxShadow: "0px 4px 6px rgba(0, 0, 0, 0.3)", }}>
            Report Crime
          </button>
        </div>
      </div>

      {/* Multi-step Report Form Modal */}
      {showForm && !selectingLocation && (
        <div style={{ position: "fixed", top: "0", left: "0", right: "0", bottom: "0", background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 9999 }}>
          <div style={{ backgroundColor: isDark ? "#1c2e40" : "#f1f1dd", color: isDark ? "#fff" : "#000", padding: "20px", borderRadius: "10px", width: "400px", boxShadow: "0px 0px 10px rgba(0,0,0,0.3)", position: "relative" }}>
            <button onClick={() => { setShowForm(false); setFormStep(1); }} style={{ position: "absolute", top: "8px", right: "5px", background: "none", border: "none", fontSize: "30px", cursor: "pointer" }}>
              ×
            </button>
            {/* Progress Bar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              {stepsArray.map((step) => (
                <div key={step} style={{ textAlign: "center", flex: 1, position: "relative" }}>
                  {step !== 1 && (
                    <div style={{ position: "absolute", top: "15px", left: "-50%", width: "100%", height: "2px", backgroundColor: isDark ? "#999" : "#ccc", zIndex: -1 }}></div>
                  )}
                  <div style={{
                    width: "30px",
                    height: "30px",
                    borderRadius: "50%",
                    backgroundColor: formStep >= step ? "#007bff" : (isDark ? "#2f4f6f" : "#ddd"),
                    color: formStep >= step ? "#fff" : (isDark ? "#fff" : "#000"),
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto",
                    fontWeight: "bold"
                  }}>
                    {step}
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={handleFormSubmit}>
              {renderWizardStep()}
              <div style={{ display: "flex", marginTop: "20px", gap: "10px" }}>
                {formStep > 1 && (
                  <button type="button" onClick={handlePrevStep} style={{ ...buttonStyle, backgroundColor: "#ccc", color: "#000", flex: 1 }}>
                    Previous
                  </button>
                )}
                {formStep < totalSteps && (
                  <button type="button" onClick={handleNextStep} style={{ ...buttonStyle, backgroundColor: "#007bff", color: "#fff", flex: 1 }}>
                    Next
                  </button>
                )}
                {formStep === totalSteps && (
                  <button type="submit" style={{ ...buttonStyle, backgroundColor: "green", color: "#fff", flex: 1 }}>
                    Submit
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mapbox Map */}
      <div
        ref={mapRef}
        style={{
          width: "1200px",
          height: "700px",
          margin: "20px auto",
          border: "2px solid black",
          borderRadius: "12px",
        }}
      ></div>

      {/* Location Selection Confirmation */}
      {selectingLocation && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: "10px", backgroundColor: isDark ? "#081824" : "#F9F9F9" }}>
          <button
            onClick={handleLocationConfirm}
            disabled={!selectedLocation}
            style={{ ...buttonStyle, backgroundColor: selectedLocation ? "green" : "gray", color: "white", padding: "10px 20px", opacity: selectedLocation ? 1 : 0.5 }}
          >
            Confirm Location
          </button>
        </div>
      )}

      {/* Search Results Counter */}
      <div style={{ textAlign: "center", marginTop: "10px", color: isDark ? "white" : "black" }}>
        Showing {filteredAndSearchedReports.length} of {crimeReports.length} crime reports
      </div>

      {/* Crime Type Color Legend */}
      <div style={{ color: isDark ? "white" : "black", textAlign: "center", marginTop: "10px" }}>
        <strong>Types:</strong>
        {Object.entries(crimeTypeColors).map(([key, color]) => (
          <span key={key} style={{ marginLeft: "10px" }}>
            <span style={{ display: "inline-block", width: "10px", height: "10px", backgroundColor: color, borderRadius: "50%", marginRight: "5px" }}></span>
            {key.charAt(0).toUpperCase() + key.slice(1)}
          </span>
        ))}
      </div>
    </div>
  );
};

const buttonStyle = {
  padding: "10px 18px",
  margin: "4px",
  border: "none",
  borderRadius: "12px",
  cursor: "pointer",
  fontWeight: "bold",
  fontSize: "14px",
};

const styles = {
  input: {
    width: "100%",
    padding: "8px",
    marginTop: "5px",
    borderRadius: "4px",
    border: "1px solid #ccc",
    outline: "none",
  },
};

export default MapboxCrimeMap;

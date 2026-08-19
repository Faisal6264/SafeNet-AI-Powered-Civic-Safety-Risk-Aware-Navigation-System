# 🛡️ SafeNet — AI-Powered Civic Safety & Risk-Aware Navigation

**SafeNet** is a modern, full-stack geospatial intelligence and civic response platform designed to safeguard commuters and streamline municipal incident resolution in Ambala, Haryana. Built with a responsive, glassmorphic dark interface, the platform bridges citizen reporting with authority dispatch through automated hazard evaluation, route risk analysis, and offline-first operational resilience.

---

## 🚀 Key Features

* **🧭 SafeRide Risk-Aware Navigation:** Computes dual-path routes (Fastest vs. AI Safe Corridor), dynamically analyzing active hazard intersections (waterlogged roads, live wires) to offer real-time detour advisories and safe travel corridors.
* **📍 Interactive Reporting & Map Layers:** Features precise drag-and-drop pin dropping, OpenStreetMap reverse-geocoding, and multi-layer map switching across Dark Mode, Standard Streets, and Satellite views.
* **🧠 Automated AI Severity Classification:** Utilizes NLP heuristics to categorize incident reports, score risk severity (High, Medium, Low), and output actionable advisories automatically.
* **🎙️ Hands-Free Voice SOS:** Integrated with the Web Speech API to detect emergency trigger phrases and broadcast immediate, geolocated emergency pins to nearby citizens and response teams.
* **💾 Offline-First Synchronization:** Employs an offline queue to store citizen reports during network outages, automatically batch-syncing them with the database once connectivity resumes.
* **🏛️ Authority Dispatch Console:** Provides a municipal dashboard for incident audits, work crew dispatch management, and CSV/JSON reporting.

---

## 🛠️ Tech Stack

* **Frontend:** React.js, Leaflet, React-Leaflet, Tailwind CSS (Glassmorphism)
* **Backend & Realtime:** Supabase (PostgreSQL, Realtime WebSockets, Row-Level Security, Auth)
* **APIs & Tooling:** Web Speech API, OpenStreetMap Nominatim, Modular Utilities (`geoUtils`, `aiClassifier`, `offlineQueue`, `voiceSOS`)

---

## ⚡ Quick Start

```bash
# 1. Clone the repository
git clone [https://github.com/](https://github.com/)<your-username>/safenet.git
cd safenet

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev

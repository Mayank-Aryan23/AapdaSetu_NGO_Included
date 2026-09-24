# 🚨 Disaster Alert & Safety Network App

A real-time disaster alert and safety network mobile application built using **Flutter + Supabase + AI (Gemini)**.

This app helps users:

* Report incidents (fire, medical, flood, etc.)
* Receive real-time alerts
* Track nearby disasters
* Stay connected with a safety network
* Get AI-powered safety guidance

---

# 📱 Features

## 🚨 Incident Reporting

* Multiple categories (Fire, Medical, Accident, etc.)
* Upload image evidence
* Voice recording support
* Offline report sync

## 📡 Real-Time Alerts

* Live alerts from backend
* Severity-based UI (Critical / Major / Minor)
* Tap alerts to view full details

## 🌍 Location-Based System

* Auto-detect user location
* Weather + AQI preview
* Location stored in Supabase profile

## 👥 Safety Network

* Connect with trusted users
* View linked middlemen and citizens
* Real-time safety relationships

## 🤖 AI Disaster Assistant

* Built using Gemini API
* Context-aware responses
* Uses:

  * User location
  * Nearby reports
  * Conversation history

## 💾 Offline Support

* Stores reports locally
* Syncs when internet is available

---

# 🛠️ Tech Stack

```plaintext
Flutter (Frontend)
Supabase (Auth + Database + Edge Functions)
Gemini API (AI chatbot)
Hive (Local storage)
Geolocator (Location)
```

---

# 📂 Project Structure

```plaintext
lib/
 ├── screens/
 ├── services/
 ├── widgets/
 ├── models/

assets/
android/
ios/
web/
```

---

# ⚙️ Setup Instructions

## 1. Clone the project

```bash
git clone https://github.com/your-username/your-repo.git
cd your-repo
```

---

## 2. Install dependencies

```bash
flutter pub get
```

---

## 3. Configure Supabase

Create a `.env` or config file and add:

```plaintext
SUPABASE_URL=your_url
SUPABASE_ANON_KEY=your_key
```

---

## 4. Run the app

```bash
flutter run
```

---

# 🔐 Important Notes

```plaintext
✔ Do NOT upload API keys publicly
✔ Keep .env private
✔ Supabase RLS should be configured properly
```

---

# 📦 Build Release

```bash
flutter build apk --release
```

---

# 🚀 Future Improvements

* 🔥 Real-time alert push notifications
* 🗺️ Live disaster map
* 🔊 AI voice response
* 📊 Admin dashboard
* ⚡ Background location tracking

---

# 👨‍💻 Author

Kashyap

---

# ⭐ If you like this project

Give it a star ⭐ on GitHub

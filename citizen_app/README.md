# 🌍 AapdaSetu – AI-Powered Disaster Response Platform

> Intelligent disaster preparedness, emergency reporting, and real-time citizen assistance powered by AI.

<p align="center">
  <img src="assets/images/banner.png" alt="AapdaSetu Banner" width="100%">
</p>

<p align="center">

![Flutter](https://img.shields.io/badge/Flutter-3.x-02569B?logo=flutter&logoColor=white)
![Dart](https://img.shields.io/badge/Dart-3.x-0175C2?logo=dart&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Backend-3ECF8E?logo=supabase&logoColor=white)
![Android](https://img.shields.io/badge/Platform-Android-success)
![Gemini AI](https://img.shields.io/badge/AI-Gemini-blueviolet)
![Status](https://img.shields.io/badge/Status-Active-brightgreen)

</p>

---

# 📱 Overview

**AapdaSetu** is an AI-powered disaster response mobile application that enables citizens to receive **location-aware emergency alerts**, report incidents using **multimedia evidence**, and access **intelligent disaster guidance** in real time.

The application combines **Artificial Intelligence**, **geolocation**, **cloud services**, and an **offline-first mobile architecture** to improve disaster preparedness, emergency response, and communication between citizens and authorities.

---

# 📑 Table of Contents

- [Overview](#-overview)
- [Key Highlights](#-key-highlights)
- [Core Modules](#-core-modules)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [System Architecture](#-system-architecture)
- [Screenshots](#-screenshots)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Download APK](#-download-apk)
- [Future Scope](#-future-scope)
- [Developer](#-developer)

---

# ✨ Key Highlights

- 🚨 Real-time location-based disaster alerts
- 🤖 AI-powered disaster assistant
- 📍 Automatic GPS location detection
- 🌤 Live Weather & Air Quality (AQI)
- 📸 Multimedia incident reporting
- 🎤 Voice-to-Text assisted reporting
- 👥 Safety Network for trusted contacts
- 📦 Offline-first architecture using Hive
- 🔐 Secure authentication using Supabase

---

# 🎯 Core Modules

| Module | Description |
|---------|-------------|
| 🚨 Smart Alerts | Location-based emergency alerts with severity levels |
| 🤖 AI Assistant | AI-powered disaster guidance using Gemini AI |
| 📸 Incident Reporting | Image, audio, GPS & voice-to-text enabled reporting |
| 🌤 Weather & AQI | Live weather conditions and air quality updates |
| 👥 Safety Network | Trusted contacts and emergency coordination |
| 📦 Offline Support | Hive-based caching with automatic synchronization |

---

# 🚀 Features

## 🚨 Smart Emergency Alerts

- Real-time disaster alerts based on user location
- Severity-based alert visualization
- Detailed safety precautions
- Pull-to-refresh support

---

## 🤖 AI Disaster Assistant

- AI-powered disaster guidance
- Context-aware conversations
- Voice input support
- Chat history

---

## 📝 Incident Reporting

Users can report incidents with:

- 📸 Image upload
- 🎤 Audio recording
- 🗣 Voice-to-text description
- 📝 Manual description
- 📍 GPS location
- 🏷 Disaster category selection

---

## 🌤 Weather & Air Quality

- Live weather conditions
- Temperature
- Air Quality Index (AQI)
- Automatic location updates

---

## 👥 Safety Network

- Trusted middlemen
- Linked citizens
- Emergency coordination

---

## 📦 Offline Support

- Hive local storage
- Automatic synchronization
- Improved reliability during poor connectivity

---

# 🛠 Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Flutter |
| Language | Dart |
| Backend | Supabase |
| Database | PostgreSQL |
| Authentication | Supabase Auth |
| Storage | Supabase Storage |
| Local Storage | Hive |
| AI | Gemini AI (via Supabase Edge Functions) |
| Weather API | Open-Meteo |
| AQI API | Open-Meteo Air Quality |
| Location | Geolocator |
| Voice Recognition | Speech-to-Text |
| Audio Recording | Record |
| Image Selection | Image Picker |

---

# 🏗 System Architecture

```text
                      Citizen
                         │
                         ▼
              Flutter Mobile Application
                         │
         ┌───────────────┼────────────────┐
         ▼               ▼                ▼
     Supabase      Open-Meteo APIs    Device Services
(Database/Auth)      Weather & AQI   Camera • GPS • Mic
         │
         ▼
 Supabase Edge Functions
         │
         ▼
      Gemini AI
```

---

# 📷 Screenshots

### Authentication & Home

| Login | Home |
|-------|------|
| ![](assets/screenshots/login.jpeg) | ![](assets/screenshots/home.jpeg) |

---

### Alerts & AI Assistant

| Alerts | AI Chatbot |
|-------|------|
| ![](assets/screenshots/alerts.jpeg) | ![](assets/screenshots/chatbot.jpeg) |

---

### Reports & Profile

| My Reports | Profile & Safety Network |
|-------|------|
| ![](assets/screenshots/myreports.jpeg) | ![](assets/screenshots/profile&middleman.jpeg) |

---

# 📂 Project Structure

```text
lib/
 ├── navigation/
 ├── screens/
 ├── services/
 ├── widgets/
 ├── models/
 └── main.dart

assets/
 ├── images/
 └── screenshots/

android/
ios/
```

---

# 🚀 Getting Started

## Clone Repository

```bash
git clone https://github.com/Ayush-620/AapdaSetu-Mobile.git
```

## Install Dependencies

```bash
flutter pub get
```

## Run

```bash
flutter run
```

## Build Release APK

```bash
flutter build apk --release
```

---

# 📥 Download APK

Download the latest Android APK from the **GitHub Releases** section.

👉 **Latest Release**

https://github.com/Ayush-620/AapdaSetu-Mobile/releases/latest

---

# 🎥 Demo

*A demo video will be added soon.*

---

# 🔮 Future Scope

- 🔔 Push notifications for emergency alerts
- 🗺 Interactive disaster map with nearby incidents
- 🤖 Offline AI assistance for low-connectivity regions
- 🆘 One-tap SOS with live location sharing
- 🌐 Multi-language support
- ❤️ Smart shelter and hospital locator
- 👥 Volunteer coordination platform
- 📷 AI-based damage assessment from uploaded images
- 📡 Offline mesh communication for emergency scenarios
- 💻 Progressive Web Application (PWA)

---

# 👨‍💻 Developer

**Ayush Kashyap**

B.Tech Computer Science & Engineering (AI & Data Science)

IIIT Senapati, Manipur

- GitHub: https://github.com/Ayush-620

---

# ⭐ Support

If you found this project interesting, please consider giving it a **⭐ Star** on GitHub.

Your support motivates future development and improvements.

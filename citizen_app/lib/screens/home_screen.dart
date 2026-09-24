import 'package:flutter/material.dart';
import '../services/supabase_client.dart';
import '../widgets/report_button.dart';
import '../services/location_service.dart';
import '../services/weather_service.dart';
import 'package:permission_handler/permission_handler.dart';
import '../services/auth_service.dart';
import 'package:geolocator/geolocator.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {

  bool _loadingLocation = true;
@override
void initState() {
  super.initState();
  _initLocation();      
  _updateLocation();
}
  @override
void didChangeDependencies() {
  super.didChangeDependencies();
  _handleLocationUpdate();
}

void _handleLocationUpdate() async {
  bool serviceEnabled = await Geolocator.isLocationServiceEnabled();

  if (serviceEnabled && mounted) {
    final pos = await LocationService.getCurrentLocation();

    if (pos != null) {
      setState(() {
        LocationService.latitude = pos.latitude;
        LocationService.longitude = pos.longitude;
        _loadingLocation = false; 
      });

      await AuthService.updateUserLocation(
        lat: pos.latitude,
        lng: pos.longitude,
      );
    }
  }
}

/*oid _checkLocationAgain() async {
  bool serviceEnabled = await Geolocator.isLocationServiceEnabled();

  if (serviceEnabled &&
      LocationService.latitude == null) {
    _initLocation();
    _updateLocation();
  }
} */   
    
       
void _updateLocation() async {
  final position = await LocationService.getCurrentLocation();

  if (position != null) {
    await AuthService.updateUserLocation(
      lat: position.latitude,
      lng: position.longitude,
    );
  }
}
   
     
  

Future<void> _initLocation() async {
  bool serviceEnabled = await Geolocator.isLocationServiceEnabled();

  if (!serviceEnabled) {
    _showLocationDialog();
    if (mounted) {
      setState(() => _loadingLocation = false);
    }
    return;
  }

  LocationPermission permission = await Geolocator.checkPermission();

  if (permission == LocationPermission.denied) {
    permission = await Geolocator.requestPermission();
  }

  if (permission == LocationPermission.denied ||
      permission == LocationPermission.deniedForever) {
    if (mounted) {
      setState(() => _loadingLocation = false);
    }
    return;
  }

  final pos = await LocationService.getCurrentLocation();

  if (pos != null) {
    if (mounted) {
      setState(() {
        LocationService.latitude = pos.latitude;
        LocationService.longitude = pos.longitude;
        _loadingLocation = false; 
      });
    }

    // 🔥 also update DB here (better)
    await AuthService.updateUserLocation(
      lat: pos.latitude,
      lng: pos.longitude,
    );
  } else {
    if (mounted) {
      setState(() => _loadingLocation = false);
    }
  }
}

   Color getSeverityBadgeColor(String? severity) {
  if (severity == null) return Colors.grey;

  severity = severity.toLowerCase();

  if (severity.contains("critical")) return Colors.red;
  if (severity.contains("major")) return Colors.orange;
  if (severity.contains("minor")) return Colors.green;

  return Colors.grey;
}
    

    void _showLocationDialog() {
  showDialog(
    context: context,
    builder: (_) => AlertDialog(
      title: const Text("Location Required"),
      content: const Text(
        "Please turn on location services to see weather and alerts.",
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text("Cancel"),
        ),
        ElevatedButton(
          onPressed: () async {
            Navigator.pop(context);
            await Geolocator.openLocationSettings();
          },
          child: const Text("Open Settings"),
        ),
      ],
    ),
  );
}

  //  ALERTS
  Future<List<dynamic>> getAlerts() async {
    final res = await supabase
        .from('alerts')
        .select()
        .eq('status', 'Active')
        .order('created_at', ascending: false);

    return res;
  }

  //  LINKED USERS
  Future<Map<String, dynamic>> getLinkedUsers() async {
    final user = supabase.auth.currentUser;
    if (user == null) return {};

    final myProfile = await supabase
        .from('profiles')
        .select('citizen_id')
        .eq('id', user.id)
       .maybeSingle();

   if (myProfile == null) return {'middlemen': [], 'citizens': []};
     final myId = myProfile['citizen_id'];
    final myMiddlemenLinks = await supabase
        .from('middleman_links')
        .select('middleman_id')
        .eq('citizen_id', myId)
        .eq('status', 'Accepted');

    final middlemanIds =
        myMiddlemenLinks.map((e) => e['middleman_id']).toList();

    final middlemen = middlemanIds.isEmpty
        ? []
        : await supabase
            .from('profiles')
            .select('name')
            .inFilter('id', middlemanIds);

    final helpingLinks = await supabase
        .from('middleman_links')
        .select('citizen_id')
        .eq('middleman_id', user.id)
        .eq('status', 'Accepted');

    final citizenIds =
        helpingLinks.map((e) => e['citizen_id']).toList();

    final citizens = citizenIds.isEmpty
        ? []
        : await supabase
            .from('profiles')
            .select('name')
            .inFilter('citizen_id', citizenIds);

    return {
      'middlemen': middlemen,
      'citizens': citizens,
    };
  }

  int severityWeight(String? s) {
    if (s == null) return 0;
    s = s.toLowerCase();

    if (s.contains("critical") || s.contains("high")) return 3;
    if (s.contains("medium")) return 2;
    return 1;
  }

  Color getColor(String? severity) {
  if (severity == null) return Colors.grey.shade200;

  severity = severity.toLowerCase();

  if (severity.contains("critical")) {
    return const Color(0xFFD32F2F); // 🔴 red background
  }

  if (severity.contains("major")) {
    return const Color(0xFFFFE082); // 🟡 yellow
  }

  if (severity.contains("minor")) {
    return const Color(0xFFC8E6C9); // 🟢 green
  }

  return Colors.grey.shade200;
}

  @override
  Widget build(BuildContext context) {
      
    if (_loadingLocation) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }
     
      
    return Scaffold(
      backgroundColor: Colors.grey[100],
      body: SafeArea(
        child: FutureBuilder(
          future: getAlerts(),
          builder: (context, snapshot) {

           if (snapshot.connectionState == ConnectionState.waiting) {
  return const Center(child: CircularProgressIndicator());
}

if (!snapshot.hasData) {
  return const Center(child: Text("No data"));
}

            final alerts = snapshot.data as List;

            alerts.sort((a, b) {
              return severityWeight(b['severity'])
                  .compareTo(severityWeight(a['severity']));
            });

            return SingleChildScrollView(
              child: Column(
                children: [

                  const SizedBox(height: 16),

                  //  ALERTS 
                 ...alerts.map((data) {
                  final isCritical =
      (data['severity'] ?? "").toString().toLowerCase() == "critical";
  final bgColor = getColor(data['severity']);

  return GestureDetector(
    onTap: () {
      final steps = data['safety_steps'] ?? [];

      showDialog(
        context: context,
        builder: (_) => AlertDialog(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          title: Text(
            data['title'] ?? "",
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [

              Text(
                data['summary'] ?? "",
                style: const TextStyle(fontSize: 14),
              ),

              const SizedBox(height: 12),

              const Text(
                "Safety Precautions:",
                style: TextStyle(fontWeight: FontWeight.bold),
              ),

              const SizedBox(height: 6),

              ...List.generate(steps.length, (i) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Text("• ${steps[i]}"),
                );
              }),
            ],
          ),
        ),
      );
    },
          
    child: Container(
      margin: const EdgeInsets.symmetric(
          horizontal: 16, vertical: 6),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 6,
          )
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [

          //  TITLE (MAIN HEADING)
         Text(
  data['title'] ?? "Alert",
  style: TextStyle(
    fontWeight: FontWeight.w700, 
    fontSize: 16,
   color: isCritical ? Colors.white : Colors.grey.shade900, 
    height: 1.3, // better spacing
  ),
),

          const SizedBox(height: 6),

          //  SHORT PREVIEW
          Text(
            data['summary'] ?? "",
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
           style: TextStyle(
  fontSize: 13,
  color: isCritical ? Colors.white70 : Colors.black87,
),
          ),

          const SizedBox(height: 6),

          //  SEVERITY BADGE
          Align(
            alignment: Alignment.centerRight,
            
            child: Container(
              padding: const EdgeInsets.symmetric(
                  horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: getSeverityBadgeColor(data['severity']),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                data['severity'] ?? "Low",
             style: const TextStyle(
  fontSize: 11,
  color: Colors.white, 
  fontWeight: FontWeight.w500,
),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}),

                  const SizedBox(height: 20),

                  const ReportButton(),

                  const SizedBox(height: 20),

                  //  NETWORK (UNCHANGED)
                 Container(
                  width: double.infinity,
  margin: const EdgeInsets.symmetric(horizontal: 16),
  padding: const EdgeInsets.all(14),
  decoration: BoxDecoration(
    color: Colors.white,
    borderRadius: BorderRadius.circular(12),
    boxShadow: [
      BoxShadow(
        color: Colors.black.withOpacity(0.05),
        blurRadius: 6,
      )
    ],
  ),
  child: Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [

      const Text(
        "Safety Network",
        style: TextStyle(
          fontWeight: FontWeight.w600,
          fontSize: 16,
        ),
      ),

      const SizedBox(height: 8),

      FutureBuilder(
        future: getLinkedUsers(),
        builder: (context, snap) {

          if (!snap.hasData) {
            return const Text("Loading...");
          }

          final data = snap.data!;
          final middlemen = data['middlemen'] as List;
          final citizens = data['citizens'] as List;

          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [

              if (middlemen.isNotEmpty) ...[
                const Text("Your Middlemen:",
                    style: TextStyle(fontWeight: FontWeight.w500)),
                const SizedBox(height: 4),
                ...middlemen.map((m) => Text("• ${m['name']}")),
              ],

              if (citizens.isNotEmpty) ...[
                const SizedBox(height: 10),
                const Text("People You Help:",
                    style: TextStyle(fontWeight: FontWeight.w500)),
                const SizedBox(height: 4),
                ...citizens.map((c) => Text("• ${c['name']}")),
              ],

              if (middlemen.isEmpty && citizens.isEmpty)
                const Text("No connections yet"),
            ],
          );
        },
      ),
    ],
  ),
),

                  const SizedBox(height: 20),

                  //  WEATHER (FIXED)
               if (LocationService.latitude != null &&
    LocationService.longitude != null)
  FutureBuilder(
    future: Future.wait([
      WeatherService.getWeather(
        LocationService.latitude!,
        LocationService.longitude!,
      ),
      WeatherService.getAQI(
        LocationService.latitude!,
        LocationService.longitude!,
      ),
    ]),
    builder: (context, snapshot) {

      if (snapshot.connectionState == ConnectionState.waiting) {
        return const Center(child: CircularProgressIndicator());
      }

      if (!snapshot.hasData) {
        return const Center(child: Text("No data"));
      }

   final weather = snapshot.data![0] as Map<String, dynamic>?;
   final aqi = snapshot.data![1] as int? ?? 0;

   final temp = weather?['temperature'] ?? 0;
final code = weather?['weathercode'] ?? 0;

    String condition = "Clear";
    String emoji = "☀️";

    // 🔥 DYNAMIC WEATHER
    if (code == 0) {
      condition = "Clear";
      emoji = "☀️";
    } else if (code >= 1 && code <= 3) {
      condition = "Cloudy";
      emoji = "☁️";
    } else if (code >= 45 && code <= 48) {
      condition = "Fog";
      emoji = "🌫️";
    } else if (code >= 51 && code <= 67) {
      condition = "Rain";
      emoji = "🌧️";
    } else if (code >= 71 && code <= 77) {
      condition = "Snow";
      emoji = "❄️";
    } else if (code >= 95) {
      condition = "Thunderstorm";
      emoji = "⛈️";
    }

    //  AQI COLOR
    Color aqiColor = Colors.green;
    if (aqi > 150) {
      aqiColor = Colors.red;
    } else if (aqi > 100) {
      aqiColor = Colors.orange;
    } else if (aqi > 50) {
      aqiColor = Colors.yellow.shade700;
    }

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF42A5F5), Color(0xFF90CAF9)],
        ),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [

          //  CONDITION
          Row(
            children: [
              Text(emoji, style: const TextStyle(fontSize: 22)),
              const SizedBox(width: 6),
              Text(
                condition,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
            ],
          ),

          //  TEMP
          Text(
            "$temp°C",
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: Colors.white,
            ),
          ),

          //  AQI
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: aqiColor,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              "AQI $aqi",
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  },
),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}
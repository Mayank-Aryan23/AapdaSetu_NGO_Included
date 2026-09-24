import 'package:geolocator/geolocator.dart';

class LocationService {
  static double? latitude;
  static double? longitude;

  static Future<Position?> getCurrentLocation() async {
    //  Check if location services are enabled
    bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      print("❌ Location services disabled");
      return null;
    }

    //  Check permission
    LocationPermission permission = await Geolocator.checkPermission();

    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }

    if (permission == LocationPermission.denied) {
      print("❌ Location permission denied");
      return null;
    }

    if (permission == LocationPermission.deniedForever) {
      print("❌ Location permission permanently denied");
      return null;
    }

    // 🔥 Get position
    final pos = await Geolocator.getCurrentPosition(
      desiredAccuracy: LocationAccuracy.high,
    );

    latitude = pos.latitude;
    longitude = pos.longitude;

    print("📍 LOCATION: $latitude, $longitude");

    return pos;
  }
}
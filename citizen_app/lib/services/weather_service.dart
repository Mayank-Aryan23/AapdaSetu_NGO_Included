import 'dart:convert';
import 'package:http/http.dart' as http;

class WeatherService {

  // 🌤 WEATHER (same as your existing)
  static Future<Map<String, dynamic>?> getWeather(
      double lat, double lng) async {
    try {
      final url =
          "https://api.open-meteo.com/v1/forecast?latitude=$lat&longitude=$lng&current_weather=true";

      final res = await http.get(Uri.parse(url));

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        return data['current_weather'];
      }
    } catch (e) {
      print("Weather error: $e");
    }
    return null;
  }

  // 🌫 AQI (NEW FUNCTION)
  static Future<int?> getAQI(double lat, double lng) async {
    try {
      final url =
          "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=$lat&longitude=$lng&current=us_aqi";

      final res = await http.get(Uri.parse(url));

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        return data['current']?['us_aqi'];
      }
    } catch (e) {
      print("AQI error: $e");
    }
    return null;
  }
}
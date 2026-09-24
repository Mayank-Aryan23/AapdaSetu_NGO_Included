import 'dart:developer';

import 'package:hive/hive.dart';

class LocalStorageService {
  static final Box reportsBox = Hive.box('reports');
  static final Box profileBox = Hive.box('profile');

  static Future<void> saveReport(Map<String, dynamic> report) async {
    try {
      report["synced"] = false;
      await reportsBox.add(report);
    } catch (e) {
      log("Save Error: $e");
    }
  }

  static List getAllReports() {
    return reportsBox.values.toList();
  }

  static Future<void> saveMiddlemanId(String middlemanId) async {
    try {
      await profileBox.put('middleman', {
        'id': middlemanId,
        'synced': false,
        'updatedAt': DateTime.now().toIso8601String(),
      });
    } catch (e) {
      log("Middleman Save Error: $e");
    }
  }

  static Map<String, dynamic>? getMiddlemanData() {
    final data = profileBox.get('middleman');
    if (data is Map) {
      return Map<String, dynamic>.from(data);
    }
    return null;
  }

  static String? getMiddlemanId() {
    final data = getMiddlemanData();
    return data?['id'] as String?;
  }
}

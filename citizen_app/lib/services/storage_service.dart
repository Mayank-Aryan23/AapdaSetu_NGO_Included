import 'dart:io';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'supabase_client.dart';

class StorageService {

  /// Upload a file and return PUBLIC URL
  static Future<String?> uploadFile({
    required String filePath,
    required String bucket,   // 'images' or 'audio'
    required String prefix,   // 'img' or 'aud'
  }) async {
    try {
      final file = File(filePath);

      final fileName =
          "$prefix-${DateTime.now().millisecondsSinceEpoch}-${file.uri.pathSegments.last}";

      // upload
      await supabase.storage.from(bucket).upload(
        fileName,
        file,
        fileOptions: const FileOptions(upsert: true),
      );

      // public URL
      final url =
          supabase.storage.from(bucket).getPublicUrl(fileName);

      return url;
    } catch (e) {
      return null;
    }
  }
}
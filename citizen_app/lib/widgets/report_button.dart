import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;

import '../services/supabase_client.dart';
import '../services/location_service.dart';
import '../services/auth_service.dart';

import 'package:image_picker/image_picker.dart';
import 'package:record/record.dart';
import 'package:path_provider/path_provider.dart';
import 'package:just_audio/just_audio.dart';

import 'package:hive/hive.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:permission_handler/permission_handler.dart';

class ReportButton extends StatelessWidget {
  const ReportButton({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      width: double.infinity,
      height: 60,
      child: ElevatedButton(
        onPressed: () => _openSheet(context),
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.amber,
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12)),
        ),
        child: const Text(
          "REPORT INCIDENT",
          style: TextStyle(
              fontWeight: FontWeight.bold,
              color: Colors.black),
        ),
      ),
    );
  }

  void _openSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _ReportSheet(),
    );
  }
}

class _ReportSheet extends StatefulWidget {
  const _ReportSheet();

  @override
  State<_ReportSheet> createState() => _ReportSheetState();
}

class _ReportSheetState extends State<_ReportSheet> {
  final _descController = TextEditingController();

  final stt.SpeechToText _speech = stt.SpeechToText();
  bool _isListening = false;

  final _recorder = AudioRecorder();
  final _player = AudioPlayer();

  bool _isRecording = false;
  int _recordSeconds = 0;
  Timer? _timer;

  String _type = "Medical";
  bool _isSubmitting = false;

  String? _imagePath;
  String? _audioPath;

  List<Map<String, dynamic>> _linkedUsers = [];
  int selectedCitizenId = -1;

  Future<void> requestPermissions() async {
    await [
      Permission.camera,
      Permission.microphone,
      Permission.storage,
      Permission.location,
    ].request();
  }

  @override
  void initState() {
    super.initState();
    _loadLinkedUsers();
    _ensureLocation();
  }

  Future<void> _ensureLocation() async {
    await requestPermissions();
    await LocationService.getCurrentLocation();
  }

  Future<void> _loadLinkedUsers() async {
    final user = supabase.auth.currentUser;
    if (user == null) return;

    final links = await supabase
        .from('middleman_links')
        .select('citizen_id')
        .eq('middleman_id', user.id)
        .eq('status', 'Accepted');

    final ids = links.map((e) => e['citizen_id']).cast<int>().toList();

    if (ids.isEmpty) return;

    final users = await supabase
        .from('profiles')
        .select('name, citizen_id')
        .inFilter('citizen_id', ids);

    setState(() => _linkedUsers = users);
  }

  // 🎤 VOICE TO TEXT
  Future<void> _toggleMic() async {
    await requestPermissions();

    if (!_isListening) {
      bool available = await _speech.initialize();
      if (!available) return;

      setState(() => _isListening = true);

      _speech.listen(
        listenMode: stt.ListenMode.dictation,
        partialResults: true,
        onResult: (res) {
          setState(() {
            _descController.text = res.recognizedWords;
          });
        },
      );
    } else {
      _speech.stop();
      setState(() => _isListening = false);
    }
  }

  //  IMAGE
  Future<void> _pickImage() async {
    await requestPermissions();

    final img = await ImagePicker().pickImage(
      source: ImageSource.camera,
    );

    if (img != null) {
      setState(() => _imagePath = img.path);
    }
  }

  //  AUDIO
  Future<void> _recordAudio() async {
    await requestPermissions();

    if (!_isRecording) {
      final dir = await getTemporaryDirectory();
      final path =
          "${dir.path}/audio_${DateTime.now().millisecondsSinceEpoch}.m4a";

      await _recorder.start(const RecordConfig(), path: path);

      _timer = Timer.periodic(const Duration(seconds: 1), (_) {
        setState(() => _recordSeconds++);
      });

      setState(() {
        _audioPath = path;
        _isRecording = true;
      });
    } else {
      await _recorder.stop();
      _timer?.cancel();

      setState(() {
        _isRecording = false;
      });
    }
  }

  Future<void> _playAudio() async {
    if (_audioPath == null) return;
    await _player.setFilePath(_audioPath!);
    _player.play();
  }

  //  SUBMIT
  Future<void> _submit() async {
    if (_descController.text.isEmpty) return;

    setState(() => _isSubmitting = true);

    try {
      final lat = LocationService.latitude;
      final lng = LocationService.longitude;

      final user = AuthService.currentUser;

      final profile = await supabase
          .from('profiles')
          .select('citizen_id')
          .eq('id', user!.id)
          .single();

      int targetCitizenId =
          selectedCitizenId == -1 ? profile['citizen_id'] : selectedCitizenId;

      String? imageUrl;
      String? audioUrl;

      if (_imagePath != null) {
        final file = File(_imagePath!);
        final name = DateTime.now().millisecondsSinceEpoch.toString();

        await supabase.storage
            .from('reports')
            .upload('images/$name.jpg', file);

        imageUrl = supabase.storage
            .from('reports')
            .getPublicUrl('images/$name.jpg');
      }

      if (_audioPath != null) {
        final file = File(_audioPath!);
        final name = DateTime.now().millisecondsSinceEpoch.toString();

        await supabase.storage
            .from('reports')
            .upload('audio/$name.m4a', file);

        audioUrl = supabase.storage
            .from('reports')
            .getPublicUrl('audio/$name.m4a');
      }

      await supabase.from('citizen_reports').insert({
        'category': _type,
        'details': _descController.text,
        'status': 'Open',
        'image_url': imageUrl,
        'audio_url': audioUrl,
        'reported_for': targetCitizenId,
        'created_by': user.id,
        'latitude': lat,
        'longitude': lng,
      });

      Navigator.pop(context);

    } catch (e) {
      print("ERROR: $e");
    }

    setState(() => _isSubmitting = false);
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;

    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, bottom + 16),
      child: Container(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [

            const Text("Report Incident",
                style: TextStyle(fontWeight: FontWeight.bold)),

            const SizedBox(height: 10),

            Row(
              children: [
                _typeBtn("Medical"),
                _typeBtn("Fire"),
                _typeBtn("Flood"),
                _typeBtn("Others"),
              ],
            ),

            const SizedBox(height: 16),

            TextField(
              controller: _descController,
              minLines: 3,
              maxLines: 4,
              decoration: InputDecoration(
                hintText: "Describe incident",
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
                suffixIcon: IconButton(
                  icon: Icon(_isListening ? Icons.mic : Icons.mic_none),
                  onPressed: _toggleMic,
                ),
              ),
            ),

            if (_linkedUsers.isNotEmpty) ...[
              const SizedBox(height: 12),
              DropdownButtonFormField<int>(
                value: selectedCitizenId,
                items: [
                  const DropdownMenuItem(
                    value: -1,
                    child: Text("Myself"),
                  ),
                  ..._linkedUsers.map((u) {
                    return DropdownMenuItem(
                      value: u['citizen_id'],
                      child: Text(u['name']),
                    );
                  }),
                ],
                onChanged: (val) {
                  setState(() => selectedCitizenId = val!);
                },
              ),
            ],

            if (_imagePath != null)
              Text("Selected: ${_imagePath!.split('/').last}"),

            const SizedBox(height: 10),

            Row(
              children: [
                Expanded(
                  child: ElevatedButton(
                    onPressed: _pickImage,
                    child: const Text("Photo"),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: ElevatedButton(
                    onPressed: _recordAudio,
                    child: Text(_isRecording ? "Stop" : "Record"),
                  ),
                ),
              ],
            ),

            if (_isRecording)
              Text("Recording: $_recordSeconds sec"),

            if (_audioPath != null && !_isRecording)
              ElevatedButton(
                onPressed: _playAudio,
                child: const Text("Play Audio"),
              ),

            const SizedBox(height: 16),

            ElevatedButton(
              onPressed: _submit,
              child: const Text("Submit"),
            ),
          ],
        ),
      ),
    );
  }

  Widget _typeBtn(String type) {
    final selected = _type == type;

    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _type = type),
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 4),
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: selected ? Colors.amber : Colors.grey[200],
            borderRadius: BorderRadius.circular(8),
          ),
          child: Center(child: Text(type)),
        ),
      ),
    );
  }
}
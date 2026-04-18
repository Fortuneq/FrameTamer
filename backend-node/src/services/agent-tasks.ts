/**
 * Pre-built prompt factories for each Claude agent task type.
 * Each function returns a complete, self-contained prompt string that the
 * Claude CLI will execute autonomously via `claude -p`.
 */

// ---------------------------------------------------------------------------
// Transcription
// ---------------------------------------------------------------------------

export function buildTranscribePrompt(
  videoPath: string,
  outputPath: string,
  language = 'auto',
): string {
  const langArg = language !== 'auto' ? `, language="${language}"` : '';
  return `You are a video transcription agent. Your task:

1. First, check if faster-whisper is installed. If not, install it: pip install faster-whisper
2. Extract audio from the video file using ffmpeg:
   ffmpeg -i "${videoPath}" -ar 16000 -ac 1 -f wav "${videoPath}.wav"
3. Run transcription using faster-whisper with word-level timestamps:

\`\`\`python
from faster_whisper import WhisperModel
import json

model = WhisperModel("large-v3", compute_type="int8")
segments, info = model.transcribe("${videoPath}.wav", word_timestamps=True${langArg})

result = {"segments": [], "language": info.language, "duration": info.duration}

for segment in segments:
    seg_data = {
        "speaker": "Speaker 1",
        "start": segment.start,
        "end": segment.end,
        "words": []
    }
    for word in segment.words:
        seg_data["words"].append({
            "word": word.word.strip(),
            "start": word.start,
            "end": word.end,
            "confidence": word.probability,
            "deleted": False,
            "filler": False
        })
    result["segments"].append(seg_data)

with open("${outputPath}", "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print(f"Transcription complete: {len(result['segments'])} segments, {sum(len(s['words']) for s in result['segments'])} words")
\`\`\`

4. Save the JSON result to: ${outputPath}
5. Clean up the temporary WAV file.
6. Print "DONE" when finished.

IMPORTANT: Actually run the Python code, don't just show it. Execute it in the terminal.`;
}

// ---------------------------------------------------------------------------
// Filler word detection
// ---------------------------------------------------------------------------

export function buildFillerWordsPrompt(transcriptPath: string): string {
  return `You are a filler word detection agent. Your task:

1. Read the transcript JSON from: ${transcriptPath}
2. Analyze each word in context to identify filler words (um, uh, like, you know, so, basically, actually, right, эээ, ну, типа, как бы, вот, это, ммм, значит, короче)
3. Mark filler words by setting their "filler" field to true in the JSON
4. Be context-aware: "I like this" → "like" is NOT filler. "It's like... um..." → "like" IS filler.
5. Save the updated JSON back to: ${transcriptPath}
6. Print summary: how many filler words found and which ones.
7. Print "DONE" when finished.

Read the file, write Python code to process it, and execute it.`;
}

// ---------------------------------------------------------------------------
// Smart edit
// ---------------------------------------------------------------------------

export function buildSmartEditPrompt(transcriptPath: string, instruction: string): string {
  return `You are a smart video editing agent. Your task:

1. Read the transcript JSON from: ${transcriptPath}
2. User instruction: "${instruction}"
3. Based on the instruction, mark words as deleted (set "deleted": true) in the transcript
4. Examples of instructions and expected behavior:
   - "Remove all filler words" → delete words with filler=true
   - "Keep only the introduction" → delete everything after the intro
   - "Remove the part about pricing" → find and delete that section
   - "Make it shorter" → remove redundant/repetitive parts
5. Save the updated JSON back to: ${transcriptPath}
6. Print summary: what was removed and why
7. Print "DONE" when finished.

Read the file, write Python code to process it, and execute it.`;
}

// ---------------------------------------------------------------------------
// Video export
// ---------------------------------------------------------------------------

export function buildExportPrompt(
  videoPath: string,
  transcriptPath: string,
  outputPath: string,
  format = 'mp4',
): string {
  return `You are a video export agent. Your task:

1. Read the transcript JSON from: ${transcriptPath}
2. Calculate kept time ranges from non-deleted words (merge adjacent words into continuous segments)
3. Use ffmpeg to cut and concatenate the kept segments from: ${videoPath}
4. Export to: ${outputPath}
5. Use stream copy where possible for speed, re-encode only at cut boundaries
6. The approach:
   - Generate a filter_complex with trim filters for each kept segment
   - Concatenate them with the concat filter
   - Example for 3 segments:
     ffmpeg -i input.mp4 -filter_complex "
       [0:v]trim=start=0.1:end=2.3,setpts=PTS-STARTPTS[v0];
       [0:a]atrim=start=0.1:end=2.3,asetpts=PTS-STARTPTS[a0];
       [0:v]trim=start=3.5:end=5.0,setpts=PTS-STARTPTS[v1];
       [0:a]atrim=start=3.5:end=5.0,asetpts=PTS-STARTPTS[a1];
       [v0][a0][v1][a1]concat=n=2:v=1:a=1[outv][outa]
     " -map "[outv]" -map "[outa]" output.${format}

7. Print progress as you go
8. Print "DONE" and the output file path when finished.

Read the transcript, write the ffmpeg command, and execute it.`;
}

// ---------------------------------------------------------------------------
// Chapter generation
// ---------------------------------------------------------------------------

export function buildChaptersPrompt(transcriptPath: string): string {
  return `You are a chapter generation agent. Your task:

1. Read the transcript JSON from: ${transcriptPath}
2. Analyze the content and identify natural topic changes / chapter boundaries
3. Generate chapter markers with titles and start times
4. Save chapters as a JSON array to: ${transcriptPath.replace('.json', '_chapters.json')}
   Format: [{"title": "Introduction", "start": 0.0, "end": 45.2}, ...]
5. Print the chapters summary
6. Print "DONE" when finished.

Read the transcript file and process it.`;
}

// ---------------------------------------------------------------------------
// Custom / free-form agent
// ---------------------------------------------------------------------------

export interface ProjectContext {
  projectDir: string;
  videoPath: string;
  videoFilename: string;
  duration: number;
  width: number;
  height: number;
  transcriptPath: string;
  hasTranscript: boolean;
  transcriptPreview?: string; // first ~2000 chars of transcript text
  framesDir: string;
  hasFrames: boolean;
  importedFiles?: string[]; // list of imported media filenames (besides original video)
}

export function buildCustomPrompt(ctx: ProjectContext, instruction: string): string {
  const transcriptSection = ctx.hasTranscript
    ? `
## Transcript
Available at: ${ctx.transcriptPath}
Format: JSON with segments[].words[] (each word has: word, start, end, confidence, deleted, filler)

Preview of transcript content:
${ctx.transcriptPreview ?? '(run transcription first)'}
`
    : `
## Transcript
Not yet available. If the user asks for text-based editing, run transcription first using faster-whisper.
`;

  const framesSection = `
## Visual Frames
Frames are extracted from the video every 30 seconds and saved in ${ctx.framesDir}/
Each frame is a JPEG image named frame_NNNNNN.jpg where NNNNNN is the timestamp in seconds.
You can VIEW these images using the Read tool to analyze visual content.
Use this to:
- Identify visually interesting moments (action, expressions, gestures)
- Skip boring/empty/repeated frames
- Find the best clips for dynamic reels
- Analyze scene changes and camera angles

To analyze frames, read them: Read frame_000030.jpg, Read frame_000060.jpg, etc.
`;

  const importedSection = ctx.importedFiles && ctx.importedFiles.length > 0
    ? `\n## Imported Media Files\nThe user has imported the following additional media files into the project directory:\n${ctx.importedFiles.map(f => `- ${ctx.projectDir}/${f}`).join('\n')}\n\nUse these files for editing, concatenation, or any other operation requested by the user.\n`
    : '';

  return `You are ClipForge AI — an expert video editing agent. You have full access to the terminal and can run any command.

## Project
- Directory: ${ctx.projectDir}
- Video: ${ctx.videoPath} (${ctx.videoFilename})
- Duration: ${ctx.duration.toFixed(1)}s (${Math.floor(ctx.duration / 60)}m ${Math.floor(ctx.duration % 60)}s)
- Resolution: ${ctx.width}x${ctx.height}
${transcriptSection}${importedSection}${ctx.hasFrames ? framesSection : ''}

## Available tools
- **ffmpeg** — video/audio processing, cutting, concatenation, filters, overlays
- **Python 3** — scripting, data processing, faster-whisper for transcription
- **npm/node** — can install and use any npm packages including Remotion for motion graphics
- **Remotion** — React-based video generation framework. Use \`npx remotion\` to render React components as video overlays, subtitles, motion graphics

## Your approach
1. First analyze what the user wants
2. Check what files/tools are available (ls, which, etc.)
3. Plan your approach step by step
4. Execute commands — install packages if needed
5. Verify the result
6. Save output files in the project directory

## Output convention
Save all output files directly in the project directory (${ctx.projectDir}).
Use descriptive filenames like: result.mp4, reel_60s.mp4, subtitled.mp4, trimmed.mp4, export_final.mp4
After creating files, ALWAYS list them with sizes: ls -lh *.mp4 *.mov *.png 2>/dev/null

## User instruction
${instruction}

Important: Execute real commands, don't just describe what to do. Be creative and deliver a polished result.`;
}

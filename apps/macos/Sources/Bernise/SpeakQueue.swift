import AVFoundation
import Foundation

enum SpeakPriority {
    case needsYou
    case settled
}

struct SpeakJob {
    var text: String
    var priority: SpeakPriority
    var speakKey: String
}

final class SpeakQueue: NSObject, AVAudioPlayerDelegate {
    private let tts = TtsClient()
    private var jobs: [SpeakJob] = []
    private var player: AVAudioPlayer?
    private var playing = false
    var onStart: ((String) -> Void)?
    var onIdle: (() -> Void)?

    func enqueue(_ job: SpeakJob) {
        if job.priority == .needsYou {
            jobs.removeAll { $0.priority == .settled }
            if playing, let current = player, current.isPlaying {
                // Current clip is already a needsYou or we let it finish; only drop queued settles.
            }
            jobs.insert(job, at: 0)
        } else {
            jobs.append(job)
        }
        kick()
    }

    func stop() {
        jobs.removeAll()
        player?.stop()
        player = nil
        playing = false
        onIdle?()
    }

    private func kick() {
        guard !playing else { return }
        guard !jobs.isEmpty else {
            onIdle?()
            return
        }
        let job = jobs.removeFirst()
        playing = true
        Task { [weak self] in
            do {
                let data = try await self?.tts.speak(job.text)
                await MainActor.run {
                    self?.play(data: data, speakKey: job.speakKey)
                }
            } catch {
                await MainActor.run {
                    self?.playing = false
                    self?.kick()
                }
            }
        }
    }

    private func play(data: Data?, speakKey: String) {
        guard let data else {
            playing = false
            kick()
            return
        }
        do {
            player = try AVAudioPlayer(data: data)
            player?.delegate = self
            onStart?(speakKey)
            player?.play()
        } catch {
            playing = false
            kick()
        }
    }

    func audioPlayerDidFinishPlaying(_: AVAudioPlayer, successfully _: Bool) {
        playing = false
        kick()
    }
}

import { useEffect, useMemo, useRef, useState } from 'react';
let WaveSurfer: any = null;
import * as Tone from 'tone';
let nextNoteID = 0;

function Sample({ sample, midiAccess, selectedInput, setSamples }) {

	const [audioBuffer, setAudioBuffer] = useState(null);
	const [playingNotes, setPlayingNotes] = useState({});
	const [noteIDs, setNoteIDs] = useState({});
	const [startPoint, setStartPoint] = useState(0);
	const [isMuted, setIsMuted] = useState(false);
	const [endPoint, setEndPoint] = useState(null)
	const [timeStretch, setTimeStretch] = useState(false);

	const waveFormRef = useRef(null);
	const startPointRef = useRef(startPoint);
	const endPointRef = useRef(endPoint);
	const isMutedRef = useRef(isMuted);
	const timeStretchRef = useRef(timeStretch);

	const audioContext = useMemo(() => {
		if (typeof window !== 'undefined' && typeof window.AudioContext !== 'undefined') {
			return new window.AudioContext();
		} else {
			console.error('AudioContext is not supported in this environment.');
			return null; // or any fallback value
		}
	}, []);

	const handleToggleMute = () => {
		setIsMuted(!isMuted);
		localStorage.setItem(`${sample.url}-isMuted`, (!isMuted).toString());
	}

	useEffect(() => {
		const startAudio = async () => {
			await Tone.start();
			window.removeEventListener('click', startAudio);
		};

		window.addEventListener('click', startAudio);

		return () => {
			window.removeEventListener('click', startAudio);
		};
	}, []);


	useEffect(() => {
		let waveSurfer;
		let isCancelled = false;
		const storedIsMuted = localStorage.getItem(`${sample.url}-isMuted`);
		setIsMuted(storedIsMuted === null ? false : storedIsMuted === 'true' ? true : false);

		const loadWaveSurfer = async () => {
			const WaveSurfer = (await import('wavesurfer.js')).default;
			const RegionsPlugin = (await import('wavesurfer.js/dist/plugin/wavesurfer.regions.min.js')).default;

			if (isCancelled) return;

			waveSurfer = WaveSurfer.create({
				container: waveFormRef.current,
				waveColor: 'violet',
				progressColor: 'transparent',
				plugins: [RegionsPlugin.create()],
				interact: false,
			});

			fetch(sample.url)
				.then((response) => {
					console.log(response);
					return response.arrayBuffer();
				})
				.then((arrayBuffer) => {
					console.log(arrayBuffer);
					audioContext.decodeAudioData(arrayBuffer)
						.then((audioData) => {
							if (isCancelled) return;
							setAudioBuffer(audioData);
						});

					waveSurfer.load(sample.url);

					waveSurfer.on('ready', function () {
						const duration = waveSurfer.getDuration();
						const storedStartPoint = localStorage.getItem(`${sample.url}-start`);
						const storedEndPoint = localStorage.getItem(`${sample.url}-end`);
						const startPoint = storedStartPoint ? parseFloat(storedStartPoint) : 0;
						const endPoint = storedEndPoint ? parseFloat(storedEndPoint) : duration;

						waveSurfer.addRegion({
							start: startPoint,  // time in seconds where region starts
							end: endPoint,  // time in seconds where region ends
							color: 'hsla(248, 53%, 58%, 0.2)',  // color of region
							draggable: true, // enable dragging
							resize: true, // enable resizing
						});

						setStartPoint(startPoint);
						setEndPoint(endPoint);

						waveSurfer.on('region-update-end', (region) => {
							setStartPoint(region.start);
							setEndPoint(region.end);
							localStorage.setItem(`${sample.url}-start`, region.start.toString());
							localStorage.setItem(`${sample.url}-end`, region.end.toString());
						});

						waveSurfer.on('audioprocess', function () {
							let currentTime = waveSurfer.getCurrentTime();
							if (currentTime < startPoint || currentTime > endPoint) {
								waveSurfer.seekTo(startPoint / waveSurfer.getDuration());
							}
						});

						// remove the progress bar
						let progressContainer = waveFormRef.current.querySelector('.wave > .progress');
						if (progressContainer) progressContainer.remove();

					});

				})
				.catch((error) => {
					console.error('Error fetching or processing audio data: ', error);
				});
		};

		loadWaveSurfer();

		return () => {
			isCancelled = true;
			if (waveSurfer) {
				waveSurfer.destroy();
			}
		};
	}, [sample.url, audioContext]);

	useEffect(() => {
		startPointRef.current = startPoint;
		endPointRef.current = endPoint;
		isMutedRef.current = isMuted;
		timeStretchRef.current = timeStretch;
	}, [startPoint, endPoint, isMuted, timeStretch]);


	const handleChannelChange = (event) => {
		const newChannel = event.target.value;
		setSamples((prevSamples) =>
			prevSamples.map((s) => (s.id === sample.id ? { ...s, channel: newChannel } : s))
		);
	};

	useEffect(() => {
		const handleMIDIMessage = (message) => {
			const [status, note, velocity] = message.data;
			const channel = status & 0xf;
			const command = status & 0xf0;

			if (channel === sample.channel - 1) { // MIDI channels start from 0 in the API
				if (command === 144) { // Note on message
					playNote(note, velocity);
				} else if (command === 128) { // Note off message
					stopNote(note);
				}
			}
		};

		if (selectedInput) {
			selectedInput.onmidimessage = handleMIDIMessage;
		}

		return () => {
			if (selectedInput) {
				selectedInput.onmidimessage = null;
			}
		};
	}, [selectedInput, sample.channel, audioBuffer, audioContext]);

	const playNote = (note, velocity) => {
		if (isMutedRef.current) return;

		const originalPitch = 60;
		const playbackRate = Math.pow(2, (note - originalPitch) / 12);

		const player = new Tone.Player({
			url: sample.url,
			playbackRate: timeStretchRef.current ? 1 : playbackRate,
			onload: () => {
				const source = player.toDestination();
				const duration = endPointRef.current - startPointRef.current;

				// start the player at the 'startPointRef' in the buffer, and let it play for 'duration' seconds
				player.start(0, startPointRef.current, duration);

				const noteID = nextNoteID++;

				setPlayingNotes((prev) => ({
					...prev,
					[noteID]: {
						note,
						source,
						player,
					},
				}));

				setNoteIDs((prev) => {
					const noteIDsForNote = prev[note] || [];
					return {
						...prev,
						[note]: [...noteIDsForNote, noteID],
					};
				});
			},
		});
	};




	const stopNote = (note) => {
		const noteIDsForNote = noteIDs[note] || [];
		if (noteIDsForNote.length > 0) {
			const noteID = noteIDsForNote[noteIDsForNote.length - 1];
			if (playingNotes[noteID]) {
				playingNotes[noteID].player.stop();
				setPlayingNotes((prev) => {
					const newPlayingNotes = { ...prev };
					delete newPlayingNotes[noteID];
					return newPlayingNotes;
				});
			}

			setNoteIDs((prev) => {
				const newNoteIDsForNote = prev[note].slice(0, -1);
				return { ...prev, [note]: newNoteIDsForNote };
			});
		}
	};



	return (
		<div>
			<h2>Sample {sample.id}</h2>
			<p>URL: {sample.url}</p>
			<div ref={waveFormRef}></div>
			<p>
				MIDI Channel:{" "}
				<input
					type="number"
					min="1"
					max="16"
					value={sample.channel}
					onChange={handleChannelChange}
				/>
				<button onClick={handleToggleMute}>{isMuted ? 'Unmute' : 'Mute'}</button>
				<input
					type="checkbox"
					checked={timeStretch}
					onChange={(e) => setTimeStretch(e.target.checked)}
				/>
				<label>Time Stretch</label>
			</p>
		</div>
	);
}

export default Sample;
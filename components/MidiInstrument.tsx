import { useEffect, useMemo, useRef, useState } from "react";
import Sample from "./Sample";

export default function MidiInstrument() {
	const [midiAccess, setMidiAccess] = useState(null);
	const [selectedInput, setSelectedInput] = useState(null);
	const [samples, setSamples] = useState([
		{ id: 1, url: "/samples/wow.mp3", channel: 1 },
		// ... add as many samples as you want ...
	]);

	useEffect(() => {
		if (!navigator.requestMIDIAccess) {
			alert("Sorry, but your browser does not support the Web MIDI API.");
			return;
		}

		navigator
			.requestMIDIAccess()
			.then((access) => {
				setMidiAccess(access);
				if (access.inputs.size > 0) setSelectedInput(Array.from(access.inputs.values())[0]);
			})
			.catch((error) => alert("There was an error accessing your MIDI devices: " + error.message));
	}, []);

	return (
		<div>
			Select a MIDI input:
			<select
				value={selectedInput ? selectedInput.id : ""}
				onChange={(event) => {
					const id = event.target.value;
					const input = Array.from(midiAccess.inputs.values()).find((input: any) => input.id === id);
					setSelectedInput(input);
				}}
			>
				<option value="">Select a MIDI input</option>
				{midiAccess && Array.from(midiAccess.inputs.values()).map((input: any) => (
					<option key={input.id} value={input.id}>
						{input.name}
					</option>
				))}
			</select>
			{samples.map((sample) => (
				<Sample key={sample.id} sample={sample} selectedInput={selectedInput} midiAccess={midiAccess} setSamples={setSamples} />
			))}
		</div>
	);
}

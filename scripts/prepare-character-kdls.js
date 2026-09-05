#!/usr/bin/env node
// @ts-check

import {readFile, writeFile} from "node:fs/promises";
import {format} from "@bgotink/kdl/dessert";

import {
	dataFolder,
	gloomhavenCardBrowserDataFolder,
	worldhavenDataFolder,
} from "./constants.js";
import {
	PlayerCharacter,
	Card,
	Action,
	parsePlayerCharacter,
	CharacterMeta,
	Color,
} from "./model.js";

const frosthavenAbilityCardList =
	/** @type {{name: string; level: string; expansion: string; image: string; "character-xws": string; assetno: string}[]} */
	(
		JSON.parse(
			await readFile(
				new URL("character-ability-cards.js", worldhavenDataFolder),
				"utf8",
			),
		)
	).filter((card) => card.expansion === "frosthaven");

/** @type {Record<string, PlayerCharacter>} */
const abilitiesPerCharacter = {};

const seenFrosthavenCardNumbers = new Set();
for (const card of frosthavenAbilityCardList) {
	if (card.level === "#" || seenFrosthavenCardNumbers.has(card.assetno)) {
		continue;
	}
	seenFrosthavenCardNumbers.add(card.assetno);

	const characterName = card["character-xws"];
	const character = (abilitiesPerCharacter[characterName] ??=
		new PlayerCharacter(new CharacterMeta("frosthaven", characterName)));

	const level =
		card.level === "x" ? "X" : /** @type {Card['level']} */ (+card.level);

	character.cards.push(
		new Card(
			parseInt(card.assetno, 10),
			card.name,
			level,
			card.image,
			new Action(),
			new Action(),
		),
	);
}

/** @param {string} file */
async function importGloomhavenFile(file) {
	const path = new URL(file, gloomhavenCardBrowserDataFolder);

	try {
		return await import(path.href);
	} catch (e) {
		if (
			/** @type {NodeJS.ErrnoException} */ (e)?.code !== "ERR_MODULE_NOT_FOUND"
		) {
			throw e;
		}

		await writeFile(
			path,
			(await readFile(path, "utf-8")).replace(/^import /, "import type "),
		);

		path.searchParams.append("edited", "true");
		return await import(path.href);
	}
}

const gloomhaven2Characters = new Map(
	/** @type {{name: string; altName: string; class: string; colour: string}[]} */
	((await importGloomhavenFile("characters.ts")).characters).map(
		(character) => [character.class, character],
	),
);
/** @type {{name: string; class: string; image: string; level: number}[]} */
const gloomhaven2AbilityCards = Object.values(
	(await importGloomhavenFile("character-ability-cards.ts"))
		.characterAbilityCards.gh2,
).flat();
for (const card of gloomhaven2AbilityCards) {
	const characterInfo = gloomhaven2Characters.get(card.class);
	if (!characterInfo) {
		continue;
	}
	if (card.level === 10) {
		continue;
	}

	const character = (abilitiesPerCharacter[characterInfo.name.toLowerCase()] ??=
		new PlayerCharacter(
			new CharacterMeta(
				"gloomhaven2",
				characterInfo.name,
				characterInfo.altName,
				card.class,
				new Color(characterInfo.colour),
			),
		));

	const level =
		card.level === 1.5 ? "X"
		: card.level === 0.25 ? "M"
		: /** @type {Card['level']} */ (+card.level);

	character.cards.push(
		new Card(NaN, card.name, level, card.image, new Action(), new Action()),
	);
}

/** @type {{id: string; name: string; colour: string}[]} */
const mercCharacters = JSON.parse(
	await readFile(
		new URL("characters/mercenary.json", gloomhavenCardBrowserDataFolder),
		"utf8",
	),
);
/** @type {{name: string; image: string; level: string}[]} */
const mercCards = JSON.parse(
	await readFile(
		new URL(
			"character-abilities/mercenary.json",
			gloomhavenCardBrowserDataFolder,
		),
		"utf8",
	),
);
for (const {id, name, colour} of mercCharacters) {
	const cards = mercCards
		.filter((card) => card.image.includes(`/mercenary/${id}/`))
		.filter((card) => card.level !== "-") // skip the character-back reference card
		.map(
			(card) =>
				new Card(
					NaN,
					card.name,
					/** @type {Card['level']} */ (card.level === "X" ? "X" : +card.level),
					card.image,
					new Action(),
					new Action(),
				),
		);

	const character = new PlayerCharacter(
		new CharacterMeta("merc", name, undefined, id, new Color(colour)),
		cards,
	);

	abilitiesPerCharacter[name.toLowerCase()] = character;
}

await Promise.all(
	Object.entries(abilitiesPerCharacter).map(async ([name, character]) => {
		const characterFile = new URL(
			`${name.replaceAll(" ", "-")}.kdl`,
			dataFolder,
		);

		character.cards.sort((a, b) => a.number - b.number);

		try {
			const existingCharacter = await parsePlayerCharacter(characterFile);
			merge(existingCharacter, character);
			character = existingCharacter;
		} catch {
			// ignore
		}

		await writeFile(characterFile, format(character));
	}),
);

/**
 * @param {PlayerCharacter} target
 * @param {PlayerCharacter} source
 */
function merge(target, source) {
	const targetCardsByNumber = new Map(
		target.cards.flatMap(
			/** @returns {[string | number, Card][]} */
			(card) => {
				if (!isNaN(card.number)) {
					return [
						[card.number, card],
						[card.name, card],
					];
				} else {
					return [[card.name, card]];
				}
			},
		),
	);

	target.cards = source.cards.map((card) => {
		const targetCard =
			isNaN(card.number) ?
				targetCardsByNumber.get(card.name)
			:	targetCardsByNumber.get(card.number);
		if (targetCard == null) {
			return card;
		}

		targetCard.imagePath = card.imagePath;
		targetCard.level = card.level;
		targetCard.name = card.name;

		return targetCard;
	});
}

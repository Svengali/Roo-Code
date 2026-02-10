import { safeWriteJson } from "../../utils/safeWriteJson"
import * as path from "path"
import * as fs from "fs/promises"

import { fileExistsAtPath } from "../../utils/fs"

import { GlobalFileNames } from "../../shared/globalFileNames"
import { getTaskDirectoryPath } from "../../utils/storage"

/**
 * Delegation metadata stored per-task on disk.
 * This is the cross-process-safe source of truth for delegation fields,
 * complementing the monolithic globalState taskHistory array.
 */
export interface DelegationMeta {
	status?: "active" | "delegated" | "completed"
	delegatedToId?: string
	awaitingChildId?: string
	childIds?: string[]
	completedByChildId?: string
	completionResultSummary?: string
}

/** Known keys that may appear in a DelegationMeta object. */
const DELEGATION_META_KEYS: ReadonlySet<string> = new Set<string>([
	"status",
	"delegatedToId",
	"awaitingChildId",
	"childIds",
	"completedByChildId",
	"completionResultSummary",
])

export type ReadDelegationMetaOptions = {
	taskId: string
	globalStoragePath: string
}

/**
 * Read delegation metadata from the per-task file.
 * Returns `null` if the file doesn't exist (backward compat for old tasks).
 */
export async function readDelegationMeta({
	taskId,
	globalStoragePath,
}: ReadDelegationMetaOptions): Promise<DelegationMeta | null> {
	const taskDir = await getTaskDirectoryPath(globalStoragePath, taskId)
	const filePath = path.join(taskDir, GlobalFileNames.taskMetadata)
	const fileExists = await fileExistsAtPath(filePath)

	if (!fileExists) {
		return null
	}

	try {
		const raw = JSON.parse(await fs.readFile(filePath, "utf8"))

		if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
			console.warn(
				`[readDelegationMeta] Parsed data is not an object (got ${typeof raw}), returning null. TaskId: ${taskId}, Path: ${filePath}`,
			)
			return null
		}

		// Only extract known delegation keys to prevent pollution
		const meta: DelegationMeta = {}

		for (const key of Object.keys(raw)) {
			if (DELEGATION_META_KEYS.has(key)) {
				;(meta as any)[key] = raw[key]
			}
		}

		return meta
	} catch (error) {
		console.warn(
			`[readDelegationMeta] Failed to parse ${filePath} for task ${taskId}, returning null: ${error instanceof Error ? error.message : String(error)}`,
		)
		return null
	}
}

export type SaveDelegationMetaOptions = {
	taskId: string
	globalStoragePath: string
	meta: DelegationMeta
}

/**
 * Save delegation metadata to the per-task file.
 * Writes the complete delegation state (not a merge) via safeWriteJson
 * which uses proper-lockfile for cross-process safety.
 */
export async function saveDelegationMeta({ taskId, globalStoragePath, meta }: SaveDelegationMetaOptions) {
	const taskDir = await getTaskDirectoryPath(globalStoragePath, taskId)
	const filePath = path.join(taskDir, GlobalFileNames.taskMetadata)

	// Only write known delegation keys to prevent pollution
	const sanitized: DelegationMeta = {}

	for (const key of Object.keys(meta)) {
		if (DELEGATION_META_KEYS.has(key)) {
			;(sanitized as any)[key] = (meta as any)[key]
		}
	}

	await safeWriteJson(filePath, sanitized)
}

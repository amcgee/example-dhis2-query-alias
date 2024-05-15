import fetch from 'node-fetch'
import type { RequestInit } from 'node-fetch'

type InstanceConfig = {
    baseUrl: string,
    username: string,
    password: string,
    reportStatus: (msg: string) => void
}
type AliasRequest = {
    target: string
}

type AliasResponse = {
    id: string
    path: string
    href: string
    target: string
}

type FetchResponse = {
    status: number
    data?: AliasResponse
}

const MAX_URI_LENGTH = 2000
const ALIAS_API_PATH = 'api/query/alias'

const cachedAliases: Record<string, AliasResponse> = {}

const joinPath = (...segments: string[]) => {
    const firstPart = segments.shift()?.replace(/^\//, '')

    return segments.reduce((parts, segment) => {
        segment = segment.replace(/^\//, '').replace(/\/$/, '')
        return parts.concat(segment.split('/'))
    }, [firstPart]).join('/')
}

const fetchDHIS2 = async (config: InstanceConfig, path: string, init?: RequestInit): Promise<FetchResponse> => {
    const href = joinPath(config.baseUrl, path)
    const response = await fetch(href, {
        ...init,
        headers: {
            ...init?.headers,
            Authorization: 'Basic ' + btoa(`${config.username}:${config.password}`),
        }
    })
    return {
        status: response.status,
        data: (response.status == 200) ? <AliasResponse>(await response.json()) : undefined
    }
}

const createAlias = async (config: InstanceConfig, path: string) => {
    const body: AliasRequest = {
        target: path
    }
    return await fetchDHIS2(config, ALIAS_API_PATH, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': '*/*',
        },
        body: JSON.stringify(body)
    })
}

const fetchDHIS2WithAliasFallback = async (config: InstanceConfig, path: string, init?: RequestInit, recreateOnFailure = true): Promise<FetchResponse> => {
    const uri = joinPath(config.baseUrl, path)
    const alias = cachedAliases[path]

    if (alias) {
        config.reportStatus(`Using found alias ${alias.id}`)
        const response = await fetchDHIS2(config, alias.path)
        if (response.status === 404 && recreateOnFailure) {
            config.reportStatus(`Alias ${alias.id} may have expired, attempting to recreate`)
            delete cachedAliases[path];
            return fetchDHIS2WithAliasFallback(config, path, init, false)
        }
        config.reportStatus(`Received response ${response.status}`)
        return response;
    }

    if (uri.length >= MAX_URI_LENGTH) {
        const response = await createAlias(config, path);
        config.reportStatus(`URI exceeds maximum length (${uri.length} > ${MAX_URI_LENGTH}), creating alias...`)
        if (response.status >= 200 && response.status < 300 && response.data) {
            cachedAliases[path] = response.data
            config.reportStatus(`Alias ${response.data.id} created`)
        } else {
            throw new Error('Failed to create alias: ' + response.status)
        }
        return fetchDHIS2WithAliasFallback(config, path, init, false)
    }

    config.reportStatus('Attempting to directly fetch target')
    const response = await fetchDHIS2(config, path, init)
    if (response.status === 414) {
        config.reportStatus('Received 414, creating alias')
        const response = await createAlias(config, path);
        if (response.status >= 200 && response.status < 300 && response.data) {
            cachedAliases[path] = response.data
            config.reportStatus(`Alias ${response.data.id} created`)
        } else {
            throw new Error('Failed to create alias: ' + response.status)
        }
        return fetchDHIS2WithAliasFallback(config, path, init, false)
    }

    config.reportStatus(`Received response ${response.status}`)
    return response
}

export default fetchDHIS2WithAliasFallback
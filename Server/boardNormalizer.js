const axios = require("axios");

// Fetch decrypted connections via getConnection helper from server.js
// Note: We will pass the connection details directly from the route handlers to keep this service pure.

// ----------------------------------------------------
// 1. JIRA ADAPTER
// ----------------------------------------------------

async function getJiraCloudId(accessToken) {
    try {
        const response = await axios.get("https://api.atlassian.com/oauth/token/accessible-resources", {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/json"
            }
        });
        if (response.data && response.data.length > 0) {
            // Use the first accessible resource/site
            return response.data[0].id;
        }
        throw new Error("No accessible Jira resources found");
    } catch (error) {
        console.error("Failed to get Jira cloudId:", error.response?.data || error.message);
        throw error;
    }
}

async function fetchJiraBoards(accessToken) {
    const cloudId = await getJiraCloudId(accessToken);
    const response = await axios.get(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/board`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json"
        }
    });
    
    // Normalize boards list
    return (response.data.values || []).map(b => ({
        id: b.id.toString(),
        name: b.name,
        type: b.type,
        provider: "jira",
        projectId: b.location?.projectKey || ""
    }));
}

async function fetchJiraCards(accessToken, boardId) {
    const cloudId = await getJiraCloudId(accessToken);
    const response = await axios.get(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/board/${boardId}/issue`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json"
        }
    });

    const issues = response.data.issues || [];
    
    // Map Jira issues to unified Card schema
    return issues.map(issue => {
        const fields = issue.fields || {};
        
        // Map status to unified column
        const statusName = (fields.status?.name || "").toLowerCase();
        let status = "todo";
        if (statusName.includes("progress") || statusName.includes("dev") || statusName.includes("doing")) {
            status = "inprogress";
        } else if (statusName.includes("done") || statusName.includes("complete") || statusName.includes("closed") || statusName.includes("resolved")) {
            status = "done";
        } else if (statusName.includes("backlog")) {
            status = "backlog";
        }

        return {
            id: issue.key,
            title: fields.summary || "",
            description: fields.description?.text || fields.description || "",
            status: status,
            rawStatus: fields.status?.name || "To Do",
            provider: "jira",
            labels: fields.labels || [],
            assignees: fields.assignee ? [{
                name: fields.assignee.displayName,
                avatarUrl: fields.assignee.avatarUrls?.["32x32"] || null
            }] : [],
            updatedAt: fields.updated || new Date().toISOString()
        };
    });
}

async function moveJiraCard(accessToken, issueKey, newStatus) {
    const cloudId = await getJiraCloudId(accessToken);
    
    // 1. Fetch available transitions for this issue
    const transitionsRes = await axios.get(
        `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${issueKey}/transitions`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/json"
            }
        }
    );
    
    const transitions = transitionsRes.data.transitions || [];
    
    // 2. Find transition matching the target status
    const targetStatus = newStatus.toLowerCase();
    const transition = transitions.find(t => {
        const name = (t.name || "").toLowerCase();
        const toStatus = (t.to?.name || "").toLowerCase();
        
        // Match status mappings: todo, inprogress, done, backlog
        if (targetStatus === "todo") {
            return name.includes("todo") || name.includes("to do") || toStatus.includes("todo") || toStatus.includes("to do");
        } else if (targetStatus === "inprogress") {
            return name.includes("progress") || name.includes("start") || name.includes("dev") || toStatus.includes("progress") || toStatus.includes("doing");
        } else if (targetStatus === "done") {
            return name.includes("done") || name.includes("close") || name.includes("resolve") || name.includes("complete") || toStatus.includes("done") || toStatus.includes("closed");
        } else if (targetStatus === "backlog") {
            return name.includes("backlog") || toStatus.includes("backlog");
        }
        return false;
    });

    if (!transition) {
        throw new Error(`No matching transition found on Jira for status: ${newStatus}`);
    }

    // 3. Execute the transition
    await axios.post(
        `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${issueKey}/transitions`,
        {
            transition: { id: transition.id }
        },
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            }
        }
    );

    return { success: true, transitionExecuted: transition.name };
}

// ----------------------------------------------------
// 2. GITHUB ADAPTER (Fallback to Repository Issues as a Board)
// ----------------------------------------------------

async function fetchGithubBoards(accessToken) {
    // We return user's repositories as accessible "boards"
    const response = await axios.get("https://api.github.com/user/repos?sort=updated&per_page=20", {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json"
        }
    });

    return (response.data || []).map(repo => ({
        id: repo.full_name, // e.g. "owner/repo"
        name: repo.name,
        type: "repository",
        provider: "github",
        projectId: repo.owner?.login || ""
    }));
}

async function fetchGithubCards(accessToken, repoId) {
    // Fetch repository issues
    const response = await axios.get(`https://api.github.com/repos/${repoId}/issues?state=all&per_page=50`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json"
        }
    });

    // Exclude pull requests (GitHub API returns PRs as issues)
    const issues = (response.data || []).filter(item => !item.pull_request);

    return issues.map(issue => {
        // Map open/closed state and labels to columns
        let status = "todo";
        
        const labelsList = (issue.labels || []).map(l => (typeof l === 'string' ? l : l.name).toLowerCase());
        
        if (issue.state === "closed") {
            status = "done";
        } else if (labelsList.some(name => name.includes("progress") || name.includes("doing") || name.includes("working"))) {
            status = "inprogress";
        } else if (labelsList.some(name => name.includes("backlog"))) {
            status = "backlog";
        }

        return {
            id: issue.number.toString(),
            title: issue.title || "",
            description: issue.body || "",
            status: status,
            rawStatus: issue.state,
            provider: "github",
            labels: (issue.labels || []).map(l => typeof l === 'string' ? l : l.name),
            assignees: (issue.assignees || []).map(a => ({
                name: a.login,
                avatarUrl: a.avatar_url
            })),
            updatedAt: issue.updated_at || new Date().toISOString()
        };
    });
}

async function moveGithubCard(accessToken, repoId, cardId, newStatus) {
    // If status is done, close the issue. Otherwise, ensure it is open.
    const state = newStatus === "done" ? "closed" : "open";
    
    // We can also add/remove labels corresponding to column state
    // But basic state change is the primary action
    await axios.patch(`https://api.github.com/repos/${repoId}/issues/${cardId}`, 
        { state }, 
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            }
        }
    );

    return { success: true, stateUpdated: state };
}

// ----------------------------------------------------
// 3. TRELLO ADAPTER
// ----------------------------------------------------

async function fetchTrelloBoards(key, token) {
    const response = await axios.get(`https://api.trello.com/1/members/me/boards?key=${key}&token=${token}`);
    return (response.data || []).map(b => ({
        id: b.id,
        name: b.name,
        type: "board",
        provider: "trello",
        projectId: ""
    }));
}

async function fetchTrelloCards(key, token, boardId) {
    // 1. Fetch lists to map statuses
    const listsResponse = await axios.get(`https://api.trello.com/1/boards/${boardId}/lists?key=${key}&token=${token}`);
    const lists = listsResponse.data || [];

    const listStatusMap = {};
    lists.forEach(list => {
        const name = (list.name || "").toLowerCase();
        let status = "todo";
        if (name.includes("done") || name.includes("complete") || name.includes("archive") || name.includes("finish")) {
            status = "done";
        } else if (name.includes("progress") || name.includes("doing") || name.includes("working") || name.includes("active")) {
            status = "inprogress";
        } else if (name.includes("backlog")) {
            status = "backlog";
        }
        listStatusMap[list.id] = { status, name: list.name };
    });

    // 2. Fetch cards
    const cardsResponse = await axios.get(`https://api.trello.com/1/boards/${boardId}/cards?key=${key}&token=${token}`);
    const cards = cardsResponse.data || [];

    return cards.map(c => {
        const listInfo = listStatusMap[c.idList] || { status: "todo", name: "To Do" };
        return {
            id: c.id,
            title: c.name,
            description: c.desc || "",
            status: listInfo.status,
            rawStatus: listInfo.name,
            provider: "trello",
            labels: (c.labels || []).map(l => l.name || l.color),
            assignees: [], // Trello uses idMembers; keep it simple/empty
            updatedAt: c.dateLastActivity || new Date().toISOString()
        };
    });
}

async function moveTrelloCard(key, token, boardId, cardId, newStatus) {
    const listsResponse = await axios.get(`https://api.trello.com/1/boards/${boardId}/lists?key=${key}&token=${token}`);
    const lists = listsResponse.data || [];

    let targetList = lists.find(list => {
        const name = (list.name || "").toLowerCase();
        if (newStatus === "done") {
            return name.includes("done") || name.includes("complete") || name.includes("archive") || name.includes("finish");
        } else if (newStatus === "inprogress") {
            return name.includes("progress") || name.includes("doing") || name.includes("working") || name.includes("active");
        } else if (newStatus === "backlog") {
            return name.includes("backlog");
        } else if (newStatus === "todo") {
            return name.includes("todo") || name.includes("to do");
        }
        return false;
    });

    let targetListId;
    if (targetList) {
        targetListId = targetList.id;
    } else {
        if (lists.length > 0) {
            targetListId = lists[0].id;
        } else {
            const createListRes = await axios.post(`https://api.trello.com/1/boards/${boardId}/lists?key=${key}&token=${token}&name=${newStatus}`);
            targetListId = createListRes.data.id;
        }
    }

    await axios.put(`https://api.trello.com/1/cards/${cardId}?key=${key}&token=${token}&idList=${targetListId}`);
    return { success: true, listId: targetListId };
}

// ----------------------------------------------------
// 4. GITHUB PROJECTS V2 ADAPTER (GraphQL)
// ----------------------------------------------------

async function fetchGithubProjectsV2(accessToken) {
    const query = `
    query {
      viewer {
        projectsV2(first: 20) {
          nodes {
            id
            title
            number
            owner {
              ... on User {
                login
              }
              ... on Organization {
                login
              }
            }
          }
        }
        organizations(first: 10) {
          nodes {
            projectsV2(first: 20) {
              nodes {
                id
                title
                number
                owner {
                  ... on User {
                    login
                  }
                  ... on Organization {
                    login
                  }
                }
              }
            }
          }
        }
      }
    }`;

    const res = await axios.post("https://api.github.com/graphql", { query }, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        }
    });

    const data = res.data?.data;
    if (!data) {
        throw new Error(JSON.stringify(res.data?.errors || "GraphQL error"));
    }

    const boards = [];
    const viewerProjects = data.viewer?.projectsV2?.nodes || [];
    viewerProjects.forEach(proj => {
        boards.push({
            id: proj.id,
            name: proj.title,
            type: "project_v2",
            provider: "github_projects",
            projectId: proj.owner?.login || ""
        });
    });

    const orgs = data.viewer?.organizations?.nodes || [];
    orgs.forEach(org => {
        const orgProjects = org.projectsV2?.nodes || [];
        orgProjects.forEach(proj => {
            if (!boards.find(b => b.id === proj.id)) {
                boards.push({
                    id: proj.id,
                    name: proj.title,
                    type: "project_v2",
                    provider: "github_projects",
                    projectId: proj.owner?.login || ""
                });
            }
        });
    });

    return boards;
}

async function fetchGithubProjectsV2Cards(accessToken, projectId) {
    const query = `
    query($projectId: ID!) {
      node(id: $projectId) {
        ... on ProjectV2 {
          items(first: 50) {
            nodes {
              id
              fieldValues(first: 20) {
                nodes {
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    name
                    field {
                      ... on ProjectV2FieldCommon {
                        name
                      }
                    }
                  }
                  ... on ProjectV2ItemFieldTextValue {
                    text
                    field {
                      ... on ProjectV2FieldCommon {
                        name
                      }
                    }
                  }
                }
              }
              content {
                ... on Issue {
                  id
                  number
                  title
                  body
                  state
                  updatedAt
                  assignees(first: 5) {
                    nodes {
                      login
                      avatarUrl
                    }
                  }
                  labels(first: 10) {
                    nodes {
                      name
                    }
                  }
                }
                ... on PullRequest {
                  id
                  number
                  title
                  body
                  state
                  updatedAt
                  assignees(first: 5) {
                    nodes {
                      login
                      avatarUrl
                    }
                  }
                  labels(first: 10) {
                    nodes {
                      name
                    }
                  }
                }
                ... on DraftIssue {
                  id
                  title
                  body
                  updatedAt
                }
              }
            }
          }
        }
      }
    }`;

    const res = await axios.post("https://api.github.com/graphql", { 
        query, 
        variables: { projectId } 
    }, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        }
    });

    const data = res.data?.data;
    if (!data) {
        throw new Error(JSON.stringify(res.data?.errors || "GraphQL error"));
    }

    const items = data.node?.items?.nodes || [];
    return items.map(item => {
        const content = item.content || {};
        const fieldValues = item.fieldValues?.nodes || [];
        const statusField = fieldValues.find(fv => fv.field?.name === "Status");
        const statusName = (statusField?.name || "Todo").toLowerCase();

        let status = "todo";
        if (statusName.includes("progress") || statusName.includes("doing") || statusName.includes("work")) {
            status = "inprogress";
        } else if (statusName.includes("done") || statusName.includes("complete") || statusName.includes("close") || statusName.includes("resolved")) {
            status = "done";
        } else if (statusName.includes("backlog")) {
            status = "backlog";
        }

        let title = content.title || "";
        let description = content.body || "";
        let labels = (content.labels?.nodes || []).map(l => l.name);
        let assignees = (content.assignees?.nodes || []).map(a => ({
            name: a.login,
            avatarUrl: a.avatarUrl
        }));

        return {
            id: item.id, // Store ProjectV2Item ID for mutations
            title: title,
            description: description,
            status: status,
            rawStatus: statusField?.name || "Todo",
            provider: "github_projects",
            labels: labels,
            assignees: assignees,
            updatedAt: content.updatedAt || new Date().toISOString()
        };
    });
}

async function getStatusFieldAndOptions(accessToken, projectId) {
    const query = `
    query($projectId: ID!) {
      node(id: $projectId) {
        ... on ProjectV2 {
          fields(first: 50) {
            nodes {
              ... on ProjectV2SingleSelectField {
                id
                name
                options {
                  id
                  name
                }
              }
            }
          }
        }
      }
    }`;

    const res = await axios.post("https://api.github.com/graphql", { 
        query, 
        variables: { projectId } 
    }, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        }
    });

    const fields = res.data?.data?.node?.fields?.nodes || [];
    const statusField = fields.find(f => f.name === "Status");
    if (!statusField) {
        throw new Error("Status field not found in GitHub project");
    }

    return {
        fieldId: statusField.id,
        options: statusField.options || []
    };
}

async function moveGithubProjectsV2Card(accessToken, projectId, itemId, newStatus) {
    const { fieldId, options } = await getStatusFieldAndOptions(accessToken, projectId);

    const targetStatus = newStatus.toLowerCase();
    const matchedOption = options.find(opt => {
        const optName = (opt.name || "").toLowerCase();
        if (targetStatus === "todo") {
            return optName.includes("todo") || optName.includes("to do");
        } else if (targetStatus === "inprogress") {
            return optName.includes("progress") || optName.includes("doing") || optName.includes("work") || optName.includes("active");
        } else if (targetStatus === "done") {
            return optName.includes("done") || optName.includes("complete") || optName.includes("close") || optName.includes("resolved");
        } else if (targetStatus === "backlog") {
            return optName.includes("backlog");
        }
        return false;
    });

    if (!matchedOption) {
        throw new Error(`No matching option found for status: ${newStatus}`);
    }

    const mutation = `
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
      updateProjectV2ItemFieldValue(
        input: {
          projectId: $projectId
          itemId: $itemId
          fieldId: $fieldId
          value: {
            singleSelectOptionId: $optionId
          }
        }
      ) {
        projectV2Item {
          id
        }
      }
    }`;

    const res = await axios.post("https://api.github.com/graphql", {
        query: mutation,
        variables: {
            projectId,
            itemId,
            fieldId,
            optionId: matchedOption.id
        }
    }, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        }
    });

    if (res.data?.errors && res.data.errors.length > 0) {
        throw new Error(JSON.stringify(res.data.errors));
    }

    return { success: true, updatedOption: matchedOption.name };
}

module.exports = {
    fetchJiraBoards,
    fetchJiraCards,
    moveJiraCard,
    fetchGithubBoards,
    fetchGithubCards,
    moveGithubCard,
    fetchTrelloBoards,
    fetchTrelloCards,
    moveTrelloCard,
    fetchGithubProjectsV2,
    fetchGithubProjectsV2Cards,
    moveGithubProjectsV2Card
};


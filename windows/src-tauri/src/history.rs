// The chat's history, on disk: local_dir()/conversations.json.
//
// The page owns the content — it saves the transcript it is showing, after a
// turn and after a cancelled one — and this module owns the file: where it is,
// what shape it has, what is dropped when it grows, and how it is written.
//
// The model's own context is not here. chat.rs keeps that, and `Chat::restore`
// rebuilds it from the newest conversation at launch, so the thread on screen
// is the thread the model goes on with.
//
// Newest first: `conversations[0]` is the one on screen. "New chat" starts an
// empty one in front of it and keeps the finished one behind it.

use std::io;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// How many conversations are kept. Past this the oldest goes.
const MAX_CONVERSATIONS: usize = 20;
/// How many messages one conversation keeps. Past this the oldest go.
const MAX_MESSAGES: usize = 400;
/// Longest single message kept: a pasted file is not a conversation.
const MAX_MESSAGE_CHARS: usize = 20_000;
/// What the whole file may weigh. Past this, the oldest conversations go.
const MAX_BYTES: usize = 1_000_000;

/// One message, in the neutral shape chat.rs keeps: `{role, content}`.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct Message {
    pub role: String,
    pub content: String,
}

/// One conversation: what the island shows, and when it last changed.
#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
    /// Stamped when it is first stored; empty before that.
    #[serde(default)]
    pub id: String,
    /// Local time, the "YYYY-MM-DD HH:MM:SS" the log uses.
    #[serde(default)]
    pub updated_at: String,
    #[serde(default)]
    pub messages: Vec<Message>,
}

/// The file as it is written: one object, so later versions can add fields.
#[derive(Default, Deserialize, Serialize)]
struct File {
    #[serde(default)]
    conversations: Vec<Conversation>,
}

pub fn path() -> PathBuf {
    crate::settings::local_dir().join("conversations.json")
}

/// The conversations on disk, newest first, cleaned and bounded. An unreadable
/// or unusable file is no conversations at all — the chat simply starts empty,
/// and the file is only written again the next time a turn is saved.
pub fn load() -> Vec<Conversation> {
    load_from(&path())
}

/// The newest conversation as the turns chat.rs keeps, for the launch restore.
pub fn current_turns() -> Vec<Value> {
    load()
        .into_iter()
        .next()
        .map(|c| {
            c.messages
                .into_iter()
                .map(|m| json!({ "role": m.role, "content": m.content }))
                .collect()
        })
        .unwrap_or_default()
}

/// Saves the transcript the page is showing as the newest conversation.
pub fn save_current(messages: Vec<Message>) -> io::Result<()> {
    save_current_at(&path(), messages)
}

/// "New chat": a fresh, empty conversation in front of the one on screen.
/// Nothing is dropped — the finished one stays in the history.
pub fn start_new() -> io::Result<()> {
    start_new_at(&path())
}

/// Forgets one conversation. Unknown ids change nothing.
pub fn delete(id: &str) -> io::Result<()> {
    delete_at(&path(), id)
}

/// Forgets every conversation.
pub fn clear() -> io::Result<()> {
    clear_at(&path())
}

/// Makes one conversation the current one — what opening it from the history does
/// — and hands back its turns, ready for `Chat::adopt`. An id that is not there
/// changes nothing.
pub fn open(id: &str) -> Result<Vec<Value>, String> {
    open_at(&path(), id).map_err(|e| e.to_string())
}

// ── The file ──────────────────────────────────────────────────────────────────

fn load_from(file: &Path) -> Vec<Conversation> {
    let mut list = std::fs::read(file).ok().as_deref().and_then(parse).unwrap_or_default();
    clean(&mut list);
    list
}

/// What the bytes of a conversations.json hold, or None when there is nothing
/// usable in them.
fn parse(bytes: &[u8]) -> Option<Vec<Conversation>> {
    let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes);
    serde_json::from_slice::<File>(bytes).ok().map(|f| f.conversations)
}

fn save_to(file: &Path, list: &[Conversation]) -> io::Result<()> {
    let mut list = list.to_vec();
    clean(&mut list);
    let bytes = serde_json::to_vec_pretty(&File { conversations: list }).map_err(io::Error::other)?;
    if let Some(dir) = file.parent() {
        crate::platform::ensure_private_dir(dir)?;
    }
    crate::config_file::replace(file, &bytes)
}

fn save_current_at(file: &Path, messages: Vec<Message>) -> io::Result<()> {
    let mut list = load_from(file);
    if list.is_empty() {
        list.push(Conversation::default());
    }
    let stamp = now();
    list[0].messages = messages;
    list[0].updated_at = stamp;
    save_to(file, &list)
}

fn start_new_at(file: &Path) -> io::Result<()> {
    let mut list = load_from(file);
    // An empty conversation on screen is already a new chat: no second one.
    if list.is_empty() || !list[0].messages.is_empty() {
        let updated_at = now();
        list.insert(0, Conversation { updated_at, ..Default::default() });
    }
    save_to(file, &list)
}

fn delete_at(file: &Path, id: &str) -> io::Result<()> {
    let mut list = load_from(file);
    list.retain(|c| c.id != id);
    save_to(file, &list)
}

fn clear_at(file: &Path) -> io::Result<()> {
    save_to(file, &[])
}

fn open_at(file: &Path, id: &str) -> io::Result<Vec<Value>> {
    let mut list = load_from(file);
    let Some(index) = list.iter().position(|c| c.id == id) else {
        return Ok(Vec::new()); // nothing to guess at: nothing moves
    };
    let conversation = list.remove(index);
    let turns = conversation
        .messages
        .iter()
        .map(|m| json!({ "role": m.role, "content": m.content }))
        .collect();
    list.insert(0, conversation);
    save_to(file, &list)?;
    Ok(turns)
}

/// What the rest of the app may see, whatever the file held: roles it knows,
/// messages that are not empty, and the caps above.
fn clean(list: &mut Vec<Conversation>) {
    for c in list.iter_mut() {
        c.messages.retain(|m| (m.role == "user" || m.role == "assistant") && !m.content.trim().is_empty());
        for m in c.messages.iter_mut() {
            if m.content.chars().count() > MAX_MESSAGE_CHARS {
                m.content = m.content.chars().take(MAX_MESSAGE_CHARS).collect();
            }
        }
        if c.messages.len() > MAX_MESSAGES {
            let extra = c.messages.len() - MAX_MESSAGES;
            c.messages.drain(..extra);
        }
    }
    // An id is how a conversation is asked for again, so anything stored
    // without one gets one, and no two conversations ever share it.
    let mut taken: Vec<String> =
        list.iter().map(|c| c.id.clone()).filter(|id| !id.trim().is_empty()).collect();
    for c in list.iter_mut() {
        if c.id.trim().is_empty() {
            c.id = fresh_id(&taken, &now());
            taken.push(c.id.clone());
        }
    }
    // Only the newest conversation may be empty: an empty one behind it is a
    // conversation that was started and never used.
    let mut kept: Vec<Conversation> = Vec::new();
    for (i, c) in list.drain(..).enumerate() {
        if i > 0 && c.messages.is_empty() {
            continue;
        }
        kept.push(c);
    }
    kept.truncate(MAX_CONVERSATIONS);
    while kept.len() > 1 && weigh(&kept) > MAX_BYTES {
        kept.pop();
    }
    *list = kept;
}

/// How big the file would be. Coarse on purpose: it decides how many
/// conversations are kept, not what is written.
fn weigh(list: &[Conversation]) -> usize {
    serde_json::to_vec(list).map(|v| v.len()).unwrap_or(0)
}

/// An id none of `taken` has: the local time, and a counter when two
/// conversations are made within the same second.
fn fresh_id(taken: &[String], stamp: &str) -> String {
    let stamp = if stamp.is_empty() { now() } else { stamp.to_string() };
    if !taken.iter().any(|id| *id == stamp) {
        return stamp;
    }
    for n in 2..1000 {
        let candidate = format!("{stamp}-{n}");
        if !taken.iter().any(|id| *id == candidate) {
            return candidate;
        }
    }
    format!("{stamp}-{}", std::process::id())
}

/// Local time, written the way the log writes it.
fn now() -> String {
    let t = crate::platform::local_time();
    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
        t.year, t.month, t.day, t.hour, t.minute, t.second
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("dapinci-history-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir.join("conversations.json")
    }

    fn said(role: &str, content: &str) -> Message {
        Message { role: role.to_string(), content: content.to_string() }
    }

    #[test]
    fn a_transcript_survives_a_save_and_a_load() {
        let file = scratch("round-trip");
        save_current_at(&file, vec![said("user", "hello"), said("assistant", "hi")]).unwrap();
        let list = load_from(&file);
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].messages, vec![said("user", "hello"), said("assistant", "hi")]);
        assert!(!list[0].id.is_empty(), "a stored conversation gets an id");
        assert_eq!(list[0].updated_at.len(), 19, "YYYY-MM-DD HH:MM:SS");
    }

    #[test]
    fn a_new_chat_keeps_the_one_that_was_on_screen() {
        let file = scratch("new-chat");
        save_current_at(&file, vec![said("user", "first")]).unwrap();
        start_new_at(&file).unwrap();
        let list = load_from(&file);
        assert_eq!(list.len(), 2);
        assert!(list[0].messages.is_empty(), "the new one is on screen");
        assert_eq!(list[1].messages, vec![said("user", "first")]);
        assert_ne!(list[0].id, list[1].id, "two conversations never share an id");
        // Asking twice in a row does not make a second empty one.
        start_new_at(&file).unwrap();
        assert_eq!(load_from(&file).len(), 2);
    }

    #[test]
    fn the_turns_the_model_gets_are_the_newest_conversation() {
        let file = scratch("turns");
        save_current_at(&file, vec![said("user", "old")]).unwrap();
        start_new_at(&file).unwrap();
        save_current_at(&file, vec![said("user", "new"), said("assistant", "answer")]).unwrap();
        let turns = load_from(&file).into_iter().next().unwrap().messages;
        assert_eq!(turns.len(), 2);
        assert_eq!(turns[0].content, "new", "the newest conversation is the one on screen");
    }

    #[test]
    fn a_conversation_goes_when_it_is_deleted_and_all_of_them_when_cleared() {
        let file = scratch("delete");
        save_current_at(&file, vec![said("user", "a")]).unwrap();
        let id = load_from(&file)[0].id.clone();
        start_new_at(&file).unwrap();
        delete_at(&file, &id).unwrap();
        assert_eq!(load_from(&file).len(), 1);
        delete_at(&file, "not-an-id").unwrap();
        assert_eq!(load_from(&file).len(), 1, "an unknown id changes nothing");
        clear_at(&file).unwrap();
        assert!(load_from(&file).is_empty());
    }

    #[test]
    fn nothing_that_is_not_a_transcript_gets_through() {
        let file = scratch("junk");
        std::fs::write(&file, b"\xEF\xBB\xBF{ not json").unwrap();
        assert!(load_from(&file).is_empty(), "a broken file is an empty history");
        std::fs::write(&file, b"{\"conversations\":[{\"messages\":[]},{\"messages\":[]}]}").unwrap();
        assert_eq!(load_from(&file).len(), 1, "only the newest may be empty");
        std::fs::write(
            &file,
            br#"{"conversations":[{"messages":[{"role":"system","content":"x"},{"role":"user","content":"  "},{"role":"user","content":"fine"}]}]}"#,
        )
        .unwrap();
        let list = load_from(&file);
        assert_eq!(list[0].messages, vec![said("user", "fine")]);
        std::fs::write(&file, br#"{"conversations":[{"messages":[{"role":"user"}]}]}"#).unwrap();
        assert!(load_from(&file).is_empty(), "a message with no content is not one");
    }

    #[test]
    fn the_caps_hold_a_transcript_that_grows_without_end() {
        let many: Vec<Message> = (0..MAX_MESSAGES + 50)
            .map(|i| said("user", &format!("message {i}")))
            .collect();
        let long = said("user", &"x".repeat(MAX_MESSAGE_CHARS + 100));
        let mut list = vec![Conversation {
            id: "1".into(),
            updated_at: now(),
            messages: many.iter().cloned().chain([long]).collect(),
        }];
        clean(&mut list);
        assert_eq!(list[0].messages.len(), MAX_MESSAGES);
        assert_eq!(
            list[0].messages.last().unwrap().content.chars().count(),
            MAX_MESSAGE_CHARS,
            "the longest message is cut to what one conversation may hold"
        );
        assert_eq!(
            list[0].messages[0].content,
            format!("message {}", 51),
            "the oldest messages go first"
        );
    }

    #[test]
    fn only_so_many_conversations_are_kept() {
        let mut list: Vec<Conversation> = (0..MAX_CONVERSATIONS + 5)
            .map(|i| Conversation {
                id: format!("{i}"),
                updated_at: now(),
                messages: vec![said("user", &format!("conversation {i}"))],
            })
            .collect();
        clean(&mut list);
        assert_eq!(list.len(), MAX_CONVERSATIONS);
        assert_eq!(list[0].id, "0", "the newest are the ones kept");
    }

    #[test]
    fn a_file_too_big_to_be_a_transcript_loses_its_oldest_conversations() {
        let body = "y".repeat(MAX_MESSAGE_CHARS);
        let mut list: Vec<Conversation> = (0..MAX_CONVERSATIONS)
            .map(|i| Conversation {
                id: format!("{i}"),
                updated_at: now(),
                messages: vec![said("user", &body); 4],
            })
            .collect();
        clean(&mut list);
        assert!(list.len() < MAX_CONVERSATIONS, "the file is held under its cap");
        assert!(weigh(&list) <= MAX_BYTES);
        assert_eq!(list[0].id, "0", "the newest conversation is never the one dropped");
    }

    #[test]
    fn opening_an_older_conversation_makes_it_the_current_one() {
        let file = scratch("open");
        save_current_at(&file, vec![said("user", "the first one")]).unwrap();
        start_new_at(&file).unwrap();
        save_current_at(&file, vec![said("user", "the second one")]).unwrap();
        let older = load_from(&file)[1].id.clone();

        let turns = open_at(&file, &older).unwrap();
        assert_eq!(
            turns,
            vec![json!({ "role": "user", "content": "the first one" })],
            "the turns come back for the model to carry on from"
        );
        let list = load_from(&file);
        assert_eq!(list[0].id, older, "and it is the one on screen now");
        assert_eq!(list[1].messages[0].content, "the second one", "nothing is lost");

        assert!(open_at(&file, "not-an-id").unwrap().is_empty(), "an id that is not there");
        assert_eq!(load_from(&file)[0].id, older, "changes nothing");
    }
}

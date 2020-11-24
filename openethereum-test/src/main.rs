use ethereum_types::{H256, U256};
use keccak_hasher::KeccakHasher;
use memory_db::*;
use reference_trie::{RefFatDB, RefFatDBMut, Trie, TrieMut};

fn main() {
    let mut memdb = MemoryDB::<KeccakHasher, HashKey<_>, _>::default();
    let mut root = Default::default();
    {
        let mut r = RefFatDBMut::new(&mut memdb, &mut root);

        for k in &[0, 1, 2] {
            let mut key = [0u8; 32];
            U256::from(*k).to_big_endian(&mut key);
            r.insert(&key[..], &1u32.to_be_bytes()[..]).unwrap();
        }
    }
    let t = RefFatDB::new(&memdb, &root).unwrap();

    // same order of result of `parity_listStorageKeys`
    for key in t
        .iter()
        .unwrap()
        .filter_map(|item| item.ok().map(|(key, _)| H256::from_slice(&key)))
    {
        dbg!(key);
    }
}

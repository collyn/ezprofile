#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backend;
mod gdrive;
mod s3;

fn main() {
    backend::run();
}


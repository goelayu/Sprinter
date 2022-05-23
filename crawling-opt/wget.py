#!/usr/bin/env python

# Fetch web page using wget
# and provide various command line options

import argparse
import subprocess


def exec_wget(args):
  
  #change to output directory
  
    WGET_ARGS = ['--no-verbose',
                 '--adjust-extension',
                 '--convert-links',
                 '--force-directories',
                 '--backup-converted',
                 '--span-hosts',
                 '--no-parent',
                 '-e', 'robots=off',
                ]
    cmd = [
        'wget',
        *(['-q'] if args.quiet else []),
        *WGET_ARGS,
        *(['-P {}'.format(args.output)] if args.output else []),
        *(['--warc-file={}'.format(args.warc)] if args.warc else []),
        *(['--page-requisites'] if args.page_requisites else []),
        '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
        args.url
    ]

    print('running cmd: ', *cmd)
    process = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    stdout, stderr = process.communicate()
    print(stderr)
    if process.returncode != 0:
        raise Exception(
            'wget failed with return code {}'.format(process.returncode))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description='Fetch web page using wget and provide various command line options')
    parser.add_argument('-u', '--url', help='URL to fetch')
    parser.add_argument(
        '-o', '--output', help='Output file location if warc file is to be created')
    parser.add_argument('-p', '--page-requisites',
                        help='Download page requisites', action='store_true')
    parser.add_argument('-w', '--warc', help='Create a warc file')
    parser.add_argument('-q', '--quiet', help='Quiet mode', action='store_true')

    args = parser.parse_args()
    exec_wget(args)

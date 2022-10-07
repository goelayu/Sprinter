# Given a source path and list of destination paths,
# this script will output the following three:
#   path in the same directory as the source path
#   path furthest away from importlib.resources import path
# from the source path
# and a random path

import argparse
import urllib.parse
import random


def parseURL(url):
    # parse the url
    return urllib.parse.urlparse(url)


def string_edit_distance(s1, s2):
    # return the edit distance between two urls
    if len(s1) > len(s2):
        s1, s2 = s2, s1

    distances = range(len(s1) + 1)
    for i2, c2 in enumerate(s2):
        distances_ = [i2+1]
        for i1, c1 in enumerate(s1):
            if c1 == c2:
                distances_.append(distances[i1])
            else:
                distances_.append(
                    1 + min((distances[i1], distances[i1 + 1], distances_[-1])))
        distances = distances_
    return distances[-1]


def farthest_path(s1, s2):
    dir1 = s1.split('/')
    dir2 = s2.split('/')

    if len(dir1) > len(dir2):
        dir1, dir2 = dir2, dir1

    return len(dir2) - len(dir1)


def get_var_paths(args):
    source, sourceP = args.source, parseURL(args.source)
    # read destination paths from file
    with open(args.destFile) as f:
        destinations = f.readlines()

    # remove empty paths
    destinations = [x.strip() for x in destinations if x.strip()]

    urlMap = {}
    # parse destination paths
    for d in destinations:
        urlMap[d] = parseURL(d)

    closest_path = ''
    closest_distance = 1000000
    farther_path = ''
    farthest_distance = 0

    for d in urlMap:
        if d == source:
          continue
        cd = string_edit_distance(source, d)
        if cd < closest_distance:
            closest_distance = cd
            closest_path = d

        fd = farthest_path(sourceP.path, urlMap[d].path)
        if fd > farthest_distance:
            farthest_distance = fd
            farther_path = d

    # get a random path
    rand_path = random.choice(destinations)

    print(source, closest_path, farther_path, rand_path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('source', help='source path')
    parser.add_argument('destFile', help='file containing destination paths')
    args = parser.parse_args()
    get_var_paths(args)
